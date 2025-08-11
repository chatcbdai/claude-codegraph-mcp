import path from "path";
import fs from "fs/promises";
import { CodeParser } from "./parser.js";
import { CodeGraph } from "./graph.js";
import { EmbeddingEngine } from "./embeddings.js";
import { SmartChunker } from "../utils/chunker.js";
import { Logger } from "../utils/logger.js";
import { IndexingStatus } from "./auto-indexer.js";
import { simpleGit } from "simple-git";

export interface ParsedFile {
  path: string;
  language: string;
  functions: any[];
  classes: any[];
  imports: any[];
  exports: any[];
  dependencies: any[];
}

export interface CodeChunk {
  id: string;
  type: string;
  content: string;
  metadata: {
    file: string;
    startLine: number;
    endLine: number;
    name?: string;
    imports?: any[];
    exports?: any[];
    calls?: any[];
    references?: any[];
  };
}

export class CodeGraphCore {
  private parser: CodeParser;
  private graph: CodeGraph;
  private embeddings: EmbeddingEngine;
  private chunker: SmartChunker;
  private logger: Logger;
  private git: any;
  private parsedFiles: Map<string, ParsedFile> = new Map();
  private codeChunks: Map<string, CodeChunk> = new Map();
  private currentProjectPath?: string;

  constructor() {
    this.parser = new CodeParser();
    this.graph = new CodeGraph({ type: "sqlite" });
    this.embeddings = new EmbeddingEngine();
    this.chunker = new SmartChunker();
    this.logger = new Logger("CodeGraphCore");
  }

  async initialize(projectPath?: string): Promise<void> {
    // Store project path for this session
    if (projectPath) {
      this.currentProjectPath = projectPath;
    }
    
    await this.parser.initialize();
    await this.graph.initialize(this.currentProjectPath);
    await this.embeddings.initialize();
    this.logger.info(`CodeGraphCore initialized for project: ${this.currentProjectPath || 'global'}`);
  }
  
  async setProjectPath(projectPath: string): Promise<void> {
    if (this.currentProjectPath !== projectPath) {
      this.currentProjectPath = projectPath;
      // Reinitialize graph with new project path
      await this.graph.initialize(projectPath);
      this.logger.info(`Switched to project: ${projectPath}`);
    }
  }

  async countIndexableFiles(dirPath: string): Promise<number> {
    const files = await this.scanDirectory(dirPath);
    return files.filter((file) => this.isIndexableFile(file)).length;
  }

  async runSyntaxPhase(
    dirPath: string,
    progressCallback: (processed: number, total: number) => void
  ): Promise<void> {
    const files = await this.getIndexableFiles(dirPath);
    let processed = 0;

    for (const file of files) {
      await this.parseFile(file);
      processed++;
      progressCallback(processed, files.length);
    }
  }

  async runGraphPhase(
    dirPath: string,
    progressCallback: (processed: number, total: number) => void
  ): Promise<void> {
    const parsedFiles = Array.from(this.parsedFiles.values());
    let processed = 0;

    for (const file of parsedFiles) {
      await this.analyzeRelationships(file);
      processed++;
      progressCallback(processed, parsedFiles.length);
    }
  }

  async runSemanticPhase(
    dirPath: string,
    progressCallback: (processed: number, total: number) => void
  ): Promise<void> {
    const chunks = Array.from(this.codeChunks.values());
    let processed = 0;

    for (const chunk of chunks) {
      await this.generateEmbedding(chunk);
      processed++;
      progressCallback(processed, chunks.length);
    }
  }

  async runTemporalPhase(
    dirPath: string,
    progressCallback: (processed: number, total: number) => void
  ): Promise<void> {
    const files = await this.getTrackedFiles(dirPath);
    let processed = 0;

    for (const file of files) {
      await this.analyzeFileHistory(file);
      processed++;
      progressCallback(processed, files.length);
    }
  }

  async finalizeIndex(dirPath: string): Promise<void> {
    await this.buildQueryIndex(dirPath);
    await this.optimizeDatabase(dirPath);
    await this.createIndexManifest(dirPath);
  }

  async isIndexStale(dirPath: string): Promise<boolean> {
    const manifestPath = path.join(dirPath, ".codegraph", "manifest.json");

    try {
      const manifest = await this.loadManifest(manifestPath);
      const currentGitHead = await this.getCurrentGitHead(dirPath);
      const lastModified = await this.getLastModifiedTime(dirPath);

      return (
        manifest.gitHead !== currentGitHead ||
        manifest.lastModified < lastModified
      );
    } catch {
      return true;
    }
  }

  async loadIndexStatus(dirPath: string): Promise<IndexingStatus | null> {
    const statusPath = path.join(dirPath, ".codegraph", "status.json");

    try {
      const statusContent = await fs.readFile(statusPath, "utf-8");
      return JSON.parse(statusContent) as IndexingStatus;
    } catch {
      return null;
    }
  }

  async saveIndexStatus(
    dirPath: string,
    status: IndexingStatus
  ): Promise<void> {
    const codegraphDir = path.join(dirPath, ".codegraph");
    const statusPath = path.join(codegraphDir, "status.json");

    await fs.mkdir(codegraphDir, { recursive: true });
    await fs.writeFile(statusPath, JSON.stringify(status, null, 2));
  }

  async reindexFile(filePath: string): Promise<void> {
    const parsedFile = await this.parseFile(filePath);
    await this.analyzeRelationships(parsedFile);
    const chunks = this.chunker.chunkCode(
      parsedFile,
      await fs.readFile(filePath, "utf-8")
    );
    for (const chunk of chunks) {
      await this.generateEmbedding(chunk);
    }
  }

  async indexNewFile(filePath: string): Promise<void> {
    await this.reindexFile(filePath);
  }

  async removeFromIndex(filePath: string): Promise<void> {
    this.parsedFiles.delete(filePath);
    const chunksToRemove = Array.from(this.codeChunks.values()).filter(
      (chunk) => chunk.metadata.file === filePath
    );
    for (const chunk of chunksToRemove) {
      this.codeChunks.delete(chunk.id);
      await this.graph.removeNode(chunk.id);
    }
  }

  private async scanDirectory(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const ignorePatterns = [
      "node_modules",
      ".git",
      ".codegraph",
      "dist",
      "build",
      "__pycache__",
    ];

    async function scan(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (
          entry.isDirectory() &&
          !ignorePatterns.some((pattern) => entry.name.includes(pattern))
        ) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    }

    await scan(dirPath);
    return files;
  }

  private isIndexableFile(filePath: string): boolean {
    const extensions = [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".py",
      ".go",
      ".rs",
      ".java",
      ".cpp",
      ".c",
      ".h",
      ".hpp",
    ];
    return extensions.some((ext) => filePath.endsWith(ext));
  }

  private async getIndexableFiles(dirPath: string): Promise<string[]> {
    const files = await this.scanDirectory(dirPath);
    return files.filter((file) => this.isIndexableFile(file));
  }

  private async parseFile(filePath: string): Promise<ParsedFile> {
    const content = await fs.readFile(filePath, "utf-8");
    const language = this.detectLanguage(filePath);
    const parsedFile = await this.parser.parseFile(content, language);
    parsedFile.path = filePath;
    parsedFile.language = language;
    
    this.parsedFiles.set(filePath, parsedFile);
    
    const chunks = this.chunker.chunkCode(parsedFile, content);
    for (const chunk of chunks) {
      this.codeChunks.set(chunk.id, chunk);
    }
    
    return parsedFile;
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath);
    const languageMap: { [key: string]: string } = {
      ".ts": "typescript",
      ".tsx": "typescript",
      ".js": "javascript",
      ".jsx": "javascript",
      ".py": "python",
      ".go": "go",
      ".rs": "rust",
      ".java": "java",
      ".cpp": "cpp",
      ".c": "c",
      ".h": "c",
      ".hpp": "cpp",
    };
    return languageMap[ext] || "text";
  }

  private async analyzeRelationships(file: ParsedFile): Promise<void> {
    await this.graph.addNode({
      id: file.path,
      type: "file",
      name: path.basename(file.path),
      file: file.path,
      content: "",
      metadata: {
        language: file.language,
        imports: file.imports,
        exports: file.exports,
      },
    });

    for (const func of file.functions) {
      await this.graph.addNode({
        id: `${file.path}:${func.name}`,
        type: "function",
        name: func.name,
        file: file.path,
        content: func.content,
        metadata: func,
      });
      
      await this.graph.addRelationship(
        file.path,
        `${file.path}:${func.name}`,
        "CONTAINS"
      );
    }

    for (const cls of file.classes) {
      await this.graph.addNode({
        id: `${file.path}:${cls.name}`,
        type: "class",
        name: cls.name,
        file: file.path,
        content: cls.content,
        metadata: cls,
      });
      
      await this.graph.addRelationship(
        file.path,
        `${file.path}:${cls.name}`,
        "CONTAINS"
      );
    }
  }

  private async generateEmbedding(chunk: CodeChunk): Promise<void> {
    const embedding = await this.embeddings.embed(chunk.content);
    await this.graph.addEmbedding(chunk.id, embedding);
  }

  private async getTrackedFiles(dirPath: string): Promise<string[]> {
    try {
      this.git = simpleGit(dirPath);
      const files = await this.git.raw(["ls-files"]);
      return files.split("\n").filter((f: string) => f && this.isIndexableFile(f));
    } catch {
      return [];
    }
  }

  private async analyzeFileHistory(filePath: string): Promise<void> {
    try {
      const log = await this.git.log({ file: filePath, "--follow": true });
      
      for (const commit of log.all || []) {
        await this.graph.addTemporalData(filePath, {
          commit: commit.hash,
          date: commit.date,
          author: commit.author_name,
          message: commit.message,
        });
      }
    } catch (error: any) {
      this.logger.warn(`Could not analyze history for ${filePath}: ${error.message}`);
    }
  }

  private async buildQueryIndex(dirPath: string): Promise<void> {
    await this.graph.createIndices();
  }

  private async optimizeDatabase(dirPath: string): Promise<void> {
    await this.graph.optimize();
  }

  private async createIndexManifest(dirPath: string): Promise<void> {
    const manifest = {
      version: "1.0.0",
      created: new Date().toISOString(),
      gitHead: await this.getCurrentGitHead(dirPath),
      lastModified: await this.getLastModifiedTime(dirPath),
      filesIndexed: this.parsedFiles.size,
      chunksCreated: this.codeChunks.size,
    };

    const manifestPath = path.join(dirPath, ".codegraph", "manifest.json");
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  private async loadManifest(manifestPath: string): Promise<any> {
    const content = await fs.readFile(manifestPath, "utf-8");
    return JSON.parse(content);
  }

  private async getCurrentGitHead(dirPath: string): Promise<string> {
    try {
      this.git = simpleGit(dirPath);
      const head = await this.git.revparse(["HEAD"]);
      return head.trim();
    } catch {
      return "no-git";
    }
  }

  private async getLastModifiedTime(dirPath: string): Promise<number> {
    const files = await this.getIndexableFiles(dirPath);
    let lastModified = 0;

    for (const file of files) {
      const stats = await fs.stat(file);
      if (stats.mtimeMs > lastModified) {
        lastModified = stats.mtimeMs;
      }
    }

    return lastModified;
  }
}