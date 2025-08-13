import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs/promises";
import crypto from "crypto";

export type RelationType = 
  | "IMPORTS"
  | "EXPORTS"
  | "CALLS"
  | "EXTENDS"
  | "IMPLEMENTS"
  | "CONTAINS"
  | "DEPENDS_ON"
  | "REFERENCES"
  | "INHERITS_FROM";

export interface GraphConfig {
  type: "sqlite" | "neo4j";
  path?: string;
  uri?: string;
  user?: string;
  password?: string;
}

export interface CodeNode {
  id: string;
  type: string;
  name: string;
  file: string;
  content: string;
  metadata: any;
}

export interface Relationship {
  from: string;
  to: string;
  type: RelationType;
  weight?: number;
  metadata?: any;
}

export interface ImpactResult {
  directImpact: CodeNode[];
  indirectImpact: CodeNode[];
  criticalPaths: string[][];
  score: number;
}

export class CodeGraph {
  private db?: Database.Database;
  private config: GraphConfig;

  constructor(config: GraphConfig) {
    this.config = config;
  }

  async initialize(projectPath?: string): Promise<void> {
    if (this.config.type === "sqlite") {
      let dbPath: string;
      
      if (this.config.path) {
        // Use explicitly configured path
        dbPath = this.config.path;
      } else if (projectPath) {
        // Create project-specific database based on project path
        // crypto already imported at top
        const projectHash = crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 8);
        const projectName = path.basename(projectPath);
        const safeProjectName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_');
        
        // Store in user's home directory with project-specific naming
        dbPath = path.join(os.homedir(), ".codegraph", "projects", `${safeProjectName}_${projectHash}`, "graph.db");
        
        console.error(`[CodeGraph] Using project-specific database: ${dbPath}`);
      } else {
        // Fallback to global database (should rarely happen now)
        dbPath = path.join(os.homedir(), ".codegraph", "graph.db");
      }
      
      const dbDir = path.dirname(dbPath);
      await fs.mkdir(dbDir, { recursive: true });
      
      // Store metadata about the project
      const metadataPath = path.join(dbDir, "project.json");
      if (projectPath && !await this.fileExists(metadataPath)) {
        await fs.writeFile(metadataPath, JSON.stringify({
          projectPath,
          projectName: path.basename(projectPath),
          createdAt: new Date().toISOString(),
          lastAccessed: new Date().toISOString()
        }, null, 2));
      }
      
      this.db = new Database(dbPath);
      this.initializeSQLite();
    }
  }
  
  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private initializeSQLite(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        file TEXT NOT NULL,
        content TEXT,
        metadata TEXT,
        embedding BLOB,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_node TEXT NOT NULL,
        to_node TEXT NOT NULL,
        type TEXT NOT NULL,
        weight INTEGER DEFAULT 1,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_node) REFERENCES nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (to_node) REFERENCES nodes(id) ON DELETE CASCADE,
        UNIQUE(from_node, to_node, type)
      );

      CREATE TABLE IF NOT EXISTS temporal_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT NOT NULL,
        commit_hash TEXT NOT NULL,
        commit_date DATETIME,
        author TEXT,
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
      CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file);
      CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
      CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_node);
      CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_node);
      CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(type);
      CREATE INDEX IF NOT EXISTS idx_temporal_node ON temporal_data(node_id);
      CREATE INDEX IF NOT EXISTS idx_temporal_commit ON temporal_data(commit_hash);
    `);
  }

  async addNode(node: CodeNode): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO nodes (id, type, name, file, content, metadata, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      node.id,
      node.type,
      node.name,
      node.file,
      node.content,
      JSON.stringify(node.metadata)
    );
  }

  async nodeExists(nodeId: string): Promise<boolean> {
    if (!this.db) throw new Error("Database not initialized");
    
    try {
      const result = this.db.prepare('SELECT id FROM nodes WHERE id = ?').get(nodeId);
      return result !== undefined;
    } catch {
      return false;
    }
  }

  async addRelationship(from: string, to: string, type: RelationType): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO relationships (from_node, to_node, type, weight)
      VALUES (?, ?, ?, 
        COALESCE((SELECT weight + 1 FROM relationships WHERE from_node = ? AND to_node = ? AND type = ?), 1)
      )
    `);

    stmt.run(from, to, type, from, to, type);
  }

  async removeNode(nodeId: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const stmt = this.db.prepare("DELETE FROM nodes WHERE id = ?");
    stmt.run(nodeId);
  }

  async findRelated(nodeId: string, depth: number = 2): Promise<CodeNode[]> {
    if (!this.db) throw new Error("Database not initialized");

    const visited = new Set<string>();
    const queue: { id: string; level: number }[] = [{ id: nodeId, level: 0 }];
    const related: CodeNode[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (current.level >= depth) continue;
      if (visited.has(current.id)) continue;
      
      visited.add(current.id);

      const relationships = this.db.prepare(`
        SELECT to_node as related_id FROM relationships WHERE from_node = ?
        UNION
        SELECT from_node as related_id FROM relationships WHERE to_node = ?
      `).all(current.id, current.id) as { related_id: string }[];

      for (const rel of relationships) {
        if (!visited.has(rel.related_id)) {
          queue.push({ id: rel.related_id, level: current.level + 1 });
          
          const node = this.db.prepare(`
            SELECT * FROM nodes WHERE id = ?
          `).get(rel.related_id) as any;
          
          if (node) {
            related.push({
              id: node.id,
              type: node.type,
              name: node.name,
              file: node.file,
              content: node.content,
              metadata: JSON.parse(node.metadata || "{}"),
            });
          }
        }
      }
    }

    return related;
  }

  async impactAnalysis(nodeId: string): Promise<ImpactResult> {
    if (!this.db) throw new Error("Database not initialized");

    const dependents = await this.findDependents(nodeId);
    const dependencies = await this.findDependencies(nodeId);
    const impactScore = this.calculateImpactScore(dependents, dependencies);
    const criticalPaths = await this.findCriticalPaths(nodeId, dependents);

    return {
      directImpact: dependents.filter((d: any) => d.distance === 1),
      indirectImpact: dependents.filter((d: any) => d.distance > 1),
      criticalPaths,
      score: impactScore,
    };
  }

  private async findDependents(nodeId: string): Promise<any[]> {
    if (!this.db) throw new Error("Database not initialized");

    const result = this.db.prepare(`
      WITH RECURSIVE dependents AS (
        SELECT to_node as id, 1 as distance
        FROM relationships
        WHERE from_node = ?
        UNION
        SELECT r.to_node as id, d.distance + 1 as distance
        FROM relationships r
        JOIN dependents d ON r.from_node = d.id
        WHERE d.distance < 5
      )
      SELECT DISTINCT n.*, d.distance
      FROM dependents d
      JOIN nodes n ON d.id = n.id
      ORDER BY d.distance
    `).all(nodeId);

    return result.map((row: any) => ({
      ...row,
      metadata: JSON.parse(row.metadata || "{}"),
      distance: row.distance,
    }));
  }

  private async findDependencies(nodeId: string): Promise<any[]> {
    if (!this.db) throw new Error("Database not initialized");

    const result = this.db.prepare(`
      WITH RECURSIVE dependencies AS (
        SELECT from_node as id, 1 as distance
        FROM relationships
        WHERE to_node = ?
        UNION
        SELECT r.from_node as id, d.distance + 1 as distance
        FROM relationships r
        JOIN dependencies d ON r.to_node = d.id
        WHERE d.distance < 5
      )
      SELECT DISTINCT n.*, d.distance
      FROM dependencies d
      JOIN nodes n ON d.id = n.id
      ORDER BY d.distance
    `).all(nodeId);

    return result.map((row: any) => ({
      ...row,
      metadata: JSON.parse(row.metadata || "{}"),
      distance: row.distance,
    }));
  }

  private calculateImpactScore(dependents: any[], dependencies: any[]): number {
    const directDependents = dependents.filter((d) => d.distance === 1).length;
    const totalDependents = dependents.length;
    const totalDependencies = dependencies.length;

    const score = 
      directDependents * 10 +
      totalDependents * 5 +
      totalDependencies * 2;

    return Math.min(100, score);
  }

  private async findCriticalPaths(nodeId: string, dependents: any[]): Promise<string[][]> {
    const paths: string[][] = [];
    
    for (const dependent of dependents.slice(0, 5)) {
      const path = await this.findPath(nodeId, dependent.id);
      if (path.length > 0) {
        paths.push(path);
      }
    }
    
    return paths;
  }

  private async findPath(from: string, to: string): Promise<string[]> {
    if (!this.db) throw new Error("Database not initialized");

    const visited = new Set<string>();
    const queue: { id: string; path: string[] }[] = [{ id: from, path: [from] }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (current.id === to) {
        return current.path;
      }
      
      if (visited.has(current.id)) continue;
      visited.add(current.id);

      const neighbors = this.db.prepare(`
        SELECT to_node as neighbor FROM relationships WHERE from_node = ?
      `).all(current.id) as { neighbor: string }[];

      for (const { neighbor } of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push({
            id: neighbor,
            path: [...current.path, neighbor],
          });
        }
      }
    }

    return [];
  }

  async addEmbedding(nodeId: string, embedding: Float32Array): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const buffer = Buffer.from(embedding.buffer);
    const stmt = this.db.prepare(`
      UPDATE nodes SET embedding = ? WHERE id = ?
    `);
    stmt.run(buffer, nodeId);
  }

  async addTemporalData(nodeId: string, data: any): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const stmt = this.db.prepare(`
      INSERT INTO temporal_data (node_id, commit_hash, commit_date, author, message)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      nodeId,
      data.commit,
      data.date,
      data.author,
      data.message
    );
  }

  async createIndices(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");
  }

  async optimize(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");
    
    this.db.exec("VACUUM");
    this.db.exec("ANALYZE");
  }

  async searchByEmbedding(embedding: Float32Array, limit: number = 20): Promise<any[]> {
    if (!this.db) throw new Error("Database not initialized");

    // Process in smaller batches to avoid loading all embeddings into memory
    const batchSize = 100;
    const allResults: any[] = [];
    let offset = 0;
    
    // Process up to 10 batches (1000 nodes max)
    for (let batch = 0; batch < 10; batch++) {
      const nodes = this.db.prepare(`
        SELECT id, type, name, file, content, metadata, embedding
        FROM nodes
        WHERE embedding IS NOT NULL
        LIMIT ? OFFSET ?
      `).all(batchSize, offset);
      
      if (nodes.length === 0) break;
      
      const batchResults = nodes
        .map((node: any) => {
          if (!node.embedding) return null;
          
          const nodeEmbedding = new Float32Array(node.embedding);
          const similarity = this.cosineSimilarity(embedding, nodeEmbedding);
          
          return {
            ...node,
            metadata: JSON.parse(node.metadata || "{}"),
            similarity,
          };
        })
        .filter((n) => n !== null);
      
      allResults.push(...batchResults);
      offset += batchSize;
    }
    
    // Sort all results and return top matches
    return allResults
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }
    return dotProduct;
  }
}