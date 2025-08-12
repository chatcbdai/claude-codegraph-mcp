import path from "path";
import fs from "fs/promises";
import { CodeParser } from "./parser.js";
import { CodeGraph } from "./graph.js";
import { EmbeddingEngine } from "./embeddings-fixed.js";
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
  typeAliases?: any[];
  constants?: any[];
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
  private static readonly INDEXER_VERSION = "2.0.0"; // Bump this to force re-index
  private parser: CodeParser;
  private graph: CodeGraph;
  private embeddings: EmbeddingEngine;
  private chunker: SmartChunker;
  private logger: Logger;
  private git: any;
  private parsedFiles: Map<string, ParsedFile> = new Map();
  private codeChunks: Map<string, CodeChunk> = new Map();
  private currentProjectPath?: string;
  private initialized: boolean = false;

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
    this.initialized = true;
    this.logger.info(`CodeGraphCore initialized for project: ${this.currentProjectPath || 'global'}`);
  }

  isInitialized(): boolean {
    return this.initialized;
  }
  
  async setProjectPath(projectPath: string): Promise<void> {
    if (this.currentProjectPath !== projectPath) {
      this.currentProjectPath = projectPath;
      // Reinitialize graph with new project path
      await this.graph.initialize(projectPath);
      this.logger.info(`Switched to project: ${projectPath}`);
    }
  }

  getProjectPath(): string {
    return this.currentProjectPath || process.cwd();
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

    // Phase 1: Create all nodes first
    for (const file of parsedFiles) {
      await this.createAllNodes(file);
      processed++;
      progressCallback(processed / 2, parsedFiles.length);
    }

    // Phase 2: Create relationships after all nodes exist
    processed = 0;
    for (const file of parsedFiles) {
      await this.createFileRelationships(file);
      processed++;
      progressCallback((parsedFiles.length + processed) / 2, parsedFiles.length);
    }
  }

  async runSemanticPhase(
    dirPath: string,
    progressCallback: (processed: number, total: number) => void
  ): Promise<void> {
    // Generate embeddings for both chunks and nodes
    const chunks = Array.from(this.codeChunks.values());
    let processed = 0;

    // First generate embeddings for chunks
    for (const chunk of chunks) {
      await this.generateEmbedding(chunk);
      processed++;
      progressCallback(processed / 2, chunks.length);
    }
    
    // Also generate embeddings for functions and classes (for semantic search)
    const parsedFiles = Array.from(this.parsedFiles.values());
    let nodeCount = 0;
    const totalNodes = parsedFiles.reduce((sum, file) => 
      sum + file.functions.length + file.classes.length, 0);
    
    for (const file of parsedFiles) {
      // Generate embeddings for functions
      for (const func of file.functions) {
        const nodeId = `${file.path}:${func.name}`;
        const text = `${func.name} ${func.content || ''}`.substring(0, 512);
        const embedding = await this.embeddings.embed(text);
        await this.graph.addEmbedding(nodeId, embedding);
        nodeCount++;
        progressCallback((chunks.length + nodeCount) / 2, chunks.length);
      }
      
      // Generate embeddings for classes
      for (const cls of file.classes) {
        const nodeId = `${file.path}:${cls.name}`;
        const text = `${cls.name} ${cls.content || ''}`.substring(0, 512);
        const embedding = await this.embeddings.embed(text);
        await this.graph.addEmbedding(nodeId, embedding);
        nodeCount++;
        progressCallback((chunks.length + nodeCount) / 2, chunks.length);
      }
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
    try {
      this.logger.info("Starting buildQueryIndex...");
      await this.buildQueryIndex(dirPath);
      this.logger.info("buildQueryIndex completed successfully");
      
      this.logger.info("Starting optimizeDatabase...");
      await this.optimizeDatabase(dirPath);
      this.logger.info("optimizeDatabase completed successfully");
      
      this.logger.info("Starting createIndexManifest...");
      await this.createIndexManifest(dirPath);
      this.logger.info("createIndexManifest completed successfully");
    } catch (error: any) {
      this.logger.error(`Error in finalizeIndex: ${error.message}`);
      this.logger.error(`Stack trace: ${error.stack}`);
      throw error;
    }
  }

  async isIndexStale(dirPath: string): Promise<boolean> {
    const manifestPath = path.join(dirPath, ".codegraph", "manifest.json");

    try {
      const manifest = await this.loadManifest(manifestPath);
      const currentGitHead = await this.getCurrentGitHead(dirPath);
      const lastModified = await this.getLastModifiedTime(dirPath);

      // Check if indexer version has changed (forces re-index after updates)
      if (manifest.indexerVersion !== CodeGraphCore.INDEXER_VERSION) {
        this.logger.info(`Indexer version changed from ${manifest.indexerVersion} to ${CodeGraphCore.INDEXER_VERSION}, re-indexing required`);
        return true;
      }

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
    await this.createAllNodes(parsedFile);
    await this.createFileRelationships(parsedFile);
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
    
    // Get git worktrees to exclude
    const worktreePaths = await this.getWorktreePaths(dirPath);

    async function scan(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        // Check if this is a worktree directory
        const isWorktree = worktreePaths.some(wt => 
          fullPath.startsWith(wt) && fullPath !== dirPath
        );
        
        if (isWorktree) {
          // Skip worktree directories
          continue;
        }
        
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
  
  private async getWorktreePaths(dirPath: string): Promise<string[]> {
    try {
      // Initialize git if not already done
      if (!this.git) {
        this.git = simpleGit(dirPath);
      }
      
      // Get worktree list
      const worktreeOutput = await this.git.raw(['worktree', 'list', '--porcelain']);
      const worktrees: string[] = [];
      
      // Parse worktree output
      const lines = worktreeOutput.split('\n');
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          const path = line.substring('worktree '.length).trim();
          worktrees.push(path);
        }
      }
      
      return worktrees;
    } catch (error) {
      // If git worktree command fails, just return empty array
      return [];
    }
  }

  private isIndexableFile(filePath: string): boolean {
    const extensions = [
      // Programming languages
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
      // Text and data files
      ".txt",
      ".md",
      ".json",
      ".yaml",
      ".yml",
      ".xml",
      ".csv",
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
      ".txt": "text",
      ".md": "markdown",
      ".json": "json",
      ".yaml": "yaml",
      ".yml": "yaml",
      ".xml": "xml",
      ".csv": "csv",
    };
    return languageMap[ext] || "text";
  }

  private async createAllNodes(file: ParsedFile): Promise<void> {
    // Add file node
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

    // Process functions - just create nodes
    for (const func of file.functions) {
      const funcId = `${file.path}:${func.name}`;
      await this.graph.addNode({
        id: funcId,
        type: "function",
        name: func.name,
        file: file.path,
        content: func.content,
        metadata: func,
      });
    }

    // Process classes - just create nodes
    for (const cls of file.classes) {
      const classId = `${file.path}:${cls.name}`;
      await this.graph.addNode({
        id: classId,
        type: "class",
        name: cls.name,
        file: file.path,
        content: cls.content,
        metadata: cls,
      });
      
      // Process methods within the class - just create nodes
      if (cls.methods && cls.methods.length > 0) {
        for (const methodName of cls.methods) {
          const methodId = `${classId}:${methodName}`;
          await this.graph.addNode({
            id: methodId,
            type: "method",
            name: methodName,
            file: file.path,
            content: "",
            metadata: { className: cls.name },
          });
        }
      }
    }
    
    // Process type aliases if present - just create nodes
    if (file.typeAliases) {
      for (const typeAlias of file.typeAliases) {
        const typeAliasId = `${file.path}:${typeAlias.name}`;
        await this.graph.addNode({
          id: typeAliasId,
          type: "type_alias",
          name: typeAlias.name,
          file: file.path,
          content: typeAlias.value,
          metadata: typeAlias,
        });
      }
    }
    
    // Process constants if present - just create nodes
    if (file.constants) {
      for (const constant of file.constants) {
        const constantId = `${file.path}:${constant.name}`;
        await this.graph.addNode({
          id: constantId,
          type: "constant",
          name: constant.name,
          file: file.path,
          content: constant.value,
          metadata: constant,
        });
      }
    }
  }

  private async createFileRelationships(file: ParsedFile): Promise<void> {
    // Process imports to create IMPORTS relationships
    for (const imp of file.imports) {
      // Try to resolve the import to a file in the project
      const resolvedPath = await this.resolveImport(imp.source, file.path);
      if (resolvedPath && await this.nodeExists(resolvedPath)) {
        await this.graph.addRelationship(
          file.path,
          resolvedPath,
          "IMPORTS"
        );
      }
    }

    // Process functions - create CONTAINS and CALLS relationships
    for (const func of file.functions) {
      const funcId = `${file.path}:${func.name}`;
      
      // Create CONTAINS relationship (file contains function)
      await this.graph.addRelationship(
        file.path,
        funcId,
        "CONTAINS"
      );
      
      // Process function calls to create CALLS relationships
      if (func.calls && func.calls.length > 0) {
        for (const calledFunc of func.calls) {
          // Try to resolve the called function
          const calledFuncId = await this.resolveFunctionCall(calledFunc, file.path);
          if (calledFuncId && await this.nodeExists(calledFuncId)) {
            await this.graph.addRelationship(
              funcId,
              calledFuncId,
              "CALLS"
            );
          }
        }
      }
    }

    // Process classes - create CONTAINS and INHERITS_FROM relationships
    for (const cls of file.classes) {
      const classId = `${file.path}:${cls.name}`;
      
      // Create CONTAINS relationship (file contains class)
      await this.graph.addRelationship(
        file.path,
        classId,
        "CONTAINS"
      );
      
      // Process class inheritance
      if (cls.extends) {
        // Parse the base classes
        const baseClasses = cls.extends.split(',').map((b: string) => b.trim());
        for (const baseClass of baseClasses) {
          // Skip common non-class bases like Protocol, ABC, etc.
          if (!['object', 'Protocol', 'ABC', 'BaseModel'].includes(baseClass)) {
            const baseClassId = await this.resolveClass(baseClass, file.path);
            if (baseClassId && await this.nodeExists(baseClassId)) {
              await this.graph.addRelationship(
                classId,
                baseClassId,
                "INHERITS_FROM"
              );
            }
          }
        }
      }
      
      // Process methods within the class - create CONTAINS relationships
      if (cls.methods && cls.methods.length > 0) {
        for (const methodName of cls.methods) {
          const methodId = `${classId}:${methodName}`;
          
          await this.graph.addRelationship(
            classId,
            methodId,
            "CONTAINS"
          );
        }
      }
    }
    
    // Process type aliases if present - create CONTAINS relationships
    if (file.typeAliases) {
      for (const typeAlias of file.typeAliases) {
        const typeAliasId = `${file.path}:${typeAlias.name}`;
        
        await this.graph.addRelationship(
          file.path,
          typeAliasId,
          "CONTAINS"
        );
      }
    }
    
    // Process constants if present - create CONTAINS relationships
    if (file.constants) {
      for (const constant of file.constants) {
        const constantId = `${file.path}:${constant.name}`;
        
        await this.graph.addRelationship(
          file.path,
          constantId,
          "CONTAINS"
        );
      }
    }
  }

  private async nodeExists(nodeId: string): Promise<boolean> {
    return await this.graph.nodeExists(nodeId);
  }

  // Keep for backward compatibility - delegates to new methods
  private async analyzeRelationships(file: ParsedFile): Promise<void> {
    await this.createAllNodes(file);
    await this.createFileRelationships(file);
  }

  private async resolveImport(importPath: string, fromFile: string): Promise<string | null> {
    // Handle relative imports
    if (importPath.startsWith('.')) {
      const dir = path.dirname(fromFile);
      
      // Check if the import already has an extension
      const hasExtension = /\.(js|jsx|ts|tsx|py|mjs|cjs)$/.test(importPath);
      
      const possiblePaths = [];
      
      if (hasExtension) {
        // If it has an extension, use it directly
        possiblePaths.push(path.resolve(dir, importPath));
      } else {
        // If no extension, try common extensions
        possiblePaths.push(
          path.resolve(dir, importPath + '.js'),
          path.resolve(dir, importPath + '.ts'),
          path.resolve(dir, importPath + '.py'),
          path.resolve(dir, importPath, 'index.js'),
          path.resolve(dir, importPath, 'index.ts'),
          path.resolve(dir, importPath, '__init__.py'),
        );
      }
      
      for (const possiblePath of possiblePaths) {
        if (this.parsedFiles.has(possiblePath)) {
          return possiblePath;
        }
      }
    }
    
    // For absolute imports, try to find the file in the project
    const projectPath = this.currentProjectPath || process.cwd();
    const possiblePaths = [
      path.join(projectPath, 'node_modules', importPath, 'index.js'),
      path.join(projectPath, 'src', importPath + '.js'),
      path.join(projectPath, 'src', importPath + '.ts'),
      path.join(projectPath, importPath + '.py'),
    ];
    
    for (const possiblePath of possiblePaths) {
      if (this.parsedFiles.has(possiblePath)) {
        return possiblePath;
      }
    }
    
    return null;
  }
  
  private async resolveFunctionCall(funcName: string, fromFile: string): Promise<string | null> {
    // First check if it's a function in the same file
    const fileData = this.parsedFiles.get(fromFile);
    if (fileData) {
      const localFunc = fileData.functions.find((f: any) => f.name === funcName);
      if (localFunc) {
        return `${fromFile}:${funcName}`;
      }
    }
    
    // Check imported modules
    if (fileData && fileData.imports) {
      // This is simplified - in reality we'd need to track what's imported from where
      for (const parsedFile of this.parsedFiles.values()) {
        const func = parsedFile.functions.find((f: any) => f.name === funcName);
        if (func) {
          return `${parsedFile.path}:${funcName}`;
        }
      }
    }
    
    return null;
  }
  
  private async resolveClass(className: string, fromFile: string): Promise<string | null> {
    // First check if it's a class in the same file
    const fileData = this.parsedFiles.get(fromFile);
    if (fileData) {
      const localClass = fileData.classes.find((c: any) => c.name === className);
      if (localClass) {
        return `${fromFile}:${className}`;
      }
    }
    
    // Check all parsed files for the class
    for (const parsedFile of this.parsedFiles.values()) {
      const cls = parsedFile.classes.find((c: any) => c.name === className);
      if (cls) {
        return `${parsedFile.path}:${className}`;
      }
    }
    
    return null;
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
      indexerVersion: CodeGraphCore.INDEXER_VERSION,  // Track indexer version
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