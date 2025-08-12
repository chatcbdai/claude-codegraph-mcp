import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs/promises";
import crypto from "crypto";

export interface ProjectDatabase {
  path: string;
  projectPath: string;
  projectName: string;
  size: number;
  lastAccessed: Date;
  created: Date;
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private databases: Map<string, Database.Database> = new Map();
  private dbRoot: string;
  private maxDatabases: number = 10;
  private maxTotalSize: number = 500 * 1024 * 1024; // 500MB

  constructor() {
    this.dbRoot = path.join(os.homedir(), ".codegraph", "projects");
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  async getDatabase(projectPath: string): Promise<Database.Database> {
    const dbPath = await this.getDatabasePath(projectPath);
    
    // Check if already open
    if (this.databases.has(dbPath)) {
      await this.updateLastAccessed(dbPath);
      return this.databases.get(dbPath)!;
    }
    
    // Check cleanup needed
    await this.cleanupIfNeeded();
    
    // Create/open database
    const dbDir = path.dirname(dbPath);
    await fs.mkdir(dbDir, { recursive: true });
    
    const db = new Database(dbPath);
    this.databases.set(dbPath, db);
    
    // Save metadata
    await this.saveProjectMetadata(projectPath, dbPath);
    
    return db;
  }

  private async getDatabasePath(projectPath: string): Promise<string> {
    const projectHash = crypto
      .createHash("sha256")
      .update(projectPath)
      .digest("hex")
      .substring(0, 12);
    
    const projectName = path.basename(projectPath)
      .replace(/[^a-zA-Z0-9-_]/g, "_")
      .substring(0, 50);
    
    return path.join(
      this.dbRoot,
      `${projectName}_${projectHash}`,
      "graph.db"
    );
  }

  private async saveProjectMetadata(projectPath: string, dbPath: string): Promise<void> {
    const metaPath = path.join(path.dirname(dbPath), "project.json");
    const metadata = {
      projectPath,
      projectName: path.basename(projectPath),
      dbPath,
      created: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      version: "2.0.0"
    };
    
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
  }

  private async updateLastAccessed(dbPath: string): Promise<void> {
    const metaPath = path.join(path.dirname(dbPath), "project.json");
    try {
      const content = await fs.readFile(metaPath, "utf-8");
      const metadata = JSON.parse(content);
      metadata.lastAccessed = new Date().toISOString();
      await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
    } catch {
      // Metadata file doesn't exist or is corrupted
    }
  }

  async listProjects(): Promise<ProjectDatabase[]> {
    const projects: ProjectDatabase[] = [];
    
    try {
      const entries = await fs.readdir(this.dbRoot, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const projectDir = path.join(this.dbRoot, entry.name);
        const metaPath = path.join(projectDir, "project.json");
        const dbPath = path.join(projectDir, "graph.db");
        
        try {
          const [metadata, stats] = await Promise.all([
            fs.readFile(metaPath, "utf-8").then(JSON.parse),
            fs.stat(dbPath)
          ]);
          
          projects.push({
            path: dbPath,
            projectPath: metadata.projectPath,
            projectName: metadata.projectName,
            size: stats.size,
            lastAccessed: new Date(metadata.lastAccessed),
            created: new Date(metadata.created)
          });
        } catch {
          // Skip corrupted project
        }
      }
    } catch {
      // Projects directory doesn't exist yet
    }
    
    return projects;
  }

  async cleanupIfNeeded(): Promise<void> {
    const projects = await this.listProjects();
    
    // Sort by last accessed (oldest first)
    projects.sort((a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime());
    
    // Calculate total size
    const totalSize = projects.reduce((sum, p) => sum + p.size, 0);
    
    // Clean up if over limits
    if (projects.length > this.maxDatabases || totalSize > this.maxTotalSize) {
      console.log("[DatabaseManager] Starting cleanup...");
      
      let currentSize = totalSize;
      let currentCount = projects.length;
      
      for (const project of projects) {
        if (currentCount <= this.maxDatabases / 2 && currentSize <= this.maxTotalSize / 2) {
          break; // Keep at least half capacity
        }
        
        // Don't delete if accessed in last 7 days
        const daysSinceAccess = (Date.now() - project.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceAccess < 7) continue;
        
        // Delete old project
        await this.deleteProject(project.path);
        currentSize -= project.size;
        currentCount--;
        
        console.log(`[DatabaseManager] Deleted old project: ${project.projectName}`);
      }
    }
  }

  async deleteProject(dbPath: string): Promise<void> {
    // Close database if open
    const db = this.databases.get(dbPath);
    if (db) {
      db.close();
      this.databases.delete(dbPath);
    }
    
    // Delete directory
    const projectDir = path.dirname(dbPath);
    await fs.rm(projectDir, { recursive: true, force: true });
  }

  async compactDatabase(projectPath: string): Promise<void> {
    const db = await this.getDatabase(projectPath);
    db.exec("VACUUM");
    db.exec("ANALYZE");
  }

  closeAll(): void {
    for (const [path, db] of this.databases) {
      db.close();
    }
    this.databases.clear();
  }
}