import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  InitializeRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { AutoIndexer } from "./core/auto-indexer.js";
import { CodeGraphCore } from "./core/indexer.js";
import { ToolHandlers } from "./handlers/tools.js";
import { ProgressiveToolHandlers } from "./handlers/progressive-tools.js";
import { ResourceHandlers } from "./handlers/resources.js";
import { StatusBroadcaster } from "./core/status-broadcaster.js";
import chokidar from "chokidar";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CodeGraphMCPServer {
  private server: Server;
  private core: CodeGraphCore;
  private autoIndexer: AutoIndexer;
  private toolHandlers: ProgressiveToolHandlers;
  private resourceHandlers: ResourceHandlers;
  private statusBroadcaster: StatusBroadcaster;
  private directoryWatcher?: chokidar.FSWatcher;
  private currentWorkingDir?: string;

  constructor() {
    this.server = new Server(
      {
        name: "codegraph-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.core = new CodeGraphCore();
    this.autoIndexer = new AutoIndexer(this.core);
    this.toolHandlers = new ProgressiveToolHandlers(this.core, this.autoIndexer);
    this.resourceHandlers = new ResourceHandlers(this.core, this.autoIndexer);
    this.statusBroadcaster = new StatusBroadcaster(this.autoIndexer);

    this.setupHandlers();
    this.setupDirectoryDetection();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.toolHandlers.getTools(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const { name, arguments: args } = request.params;

      const workingDir = this.detectWorkingDirectory(request);
      if (workingDir && workingDir !== this.currentWorkingDir) {
        await this.onWorkingDirectoryChange(workingDir);
      }

      return await this.toolHandlers.handleToolCall(name, args) as any;
    });

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: this.resourceHandlers.getResources(),
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      const { uri } = request.params;
      return await this.resourceHandlers.getResource(uri) as any;
    });

    this.statusBroadcaster.on("statusUpdate", (update) => {
      console.error(`[CodeGraph] Status Update: ${JSON.stringify(update)}`);
    });
  }

  private setupDirectoryDetection(): void {
    this.server.setRequestHandler(InitializeRequestSchema, async (request: any) => {
      // Detect VS Code workspace or current working directory
      const workingDir = this.detectInitialWorkingDirectory();
      
      if (workingDir) {
        console.error(`[CodeGraph] Detected workspace: ${workingDir}`);
        await this.onWorkingDirectoryChange(workingDir);
      } else {
        console.error(`[CodeGraph] No workspace detected, waiting for explicit paths`);
      }
      
      return {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
          resources: {},
        },
        serverInfo: {
          name: "codegraph-mcp",
          version: "1.0.0",
        },
      };
    });
  }

  private detectInitialWorkingDirectory(): string | null {
    try {
      // fs already imported at top
      
      // 1. Check VS Code environment variables
      if (process.env.VSCODE_WORKSPACE_FOLDER) {
        console.error(`[CodeGraph] Detected VS Code workspace folder: ${process.env.VSCODE_WORKSPACE_FOLDER}`);
        return process.env.VSCODE_WORKSPACE_FOLDER;
      }
      
      // 2. Check if we're in a VS Code terminal (has specific env vars)
      if (process.env.TERM_PROGRAM === 'vscode' || process.env.VSCODE_PID) {
        const cwd = process.cwd();
        // Only use cwd if it's not root and is a valid project directory
        if (cwd !== '/' && fs.existsSync(cwd)) {
          console.error(`[CodeGraph] Detected VS Code terminal in: ${cwd}`);
          return cwd;
        }
      }
      
      // 3. Check standard working directory if it looks like a project
      const cwd = process.cwd();
      if (cwd !== '/' && cwd !== '/Users' && cwd !== process.env.HOME) {
        // Check for project indicators
        const projectIndicators = ['package.json', '.git', 'tsconfig.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'];
        for (const indicator of projectIndicators) {
          if (fs.existsSync(path.join(cwd, indicator))) {
            console.error(`[CodeGraph] Detected project directory: ${cwd} (found ${indicator})`);
            return cwd;
          }
        }
      }
      
      // 4. Check if PWD environment variable is set and valid
      if (process.env.PWD && process.env.PWD !== '/' && fs.existsSync(process.env.PWD)) {
        const pwd = process.env.PWD;
        const projectIndicators = ['package.json', '.git', 'tsconfig.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'];
        for (const indicator of projectIndicators) {
          if (fs.existsSync(path.join(pwd, indicator))) {
            console.error(`[CodeGraph] Detected project directory from PWD: ${pwd}`);
            return pwd;
          }
        }
      }
      
      return null;
    } catch (error: any) {
      console.error(`[CodeGraph] Error detecting working directory: ${error.message}`);
      return null;
    }
  }

  private detectWorkingDirectory(request: any): string | null {
    try {
      if (request.params?.arguments?.path) {
        return path.resolve(request.params.arguments.path);
      }
      
      // Fall back to initial detection logic for VS Code
      return this.detectInitialWorkingDirectory();
    } catch {
      return null;
    }
  }

  private async onWorkingDirectoryChange(newWorkingDir: string): Promise<void> {
    try {
      this.currentWorkingDir = newWorkingDir;
      console.error(`[CodeGraph] Working directory changed to: ${newWorkingDir}`);
      
      // Initialize core with project path if not already initialized
      if (!this.core.isInitialized()) {
        await this.core.initialize(newWorkingDir);
      } else {
        // Switch to project-specific database
        await this.core.setProjectPath(newWorkingDir);
      }
      
      await this.autoIndexer.onClaudeCodeStart(newWorkingDir);
      
      this.setupFileWatching(newWorkingDir);
      
    } catch (error: any) {
      console.error(`[CodeGraph] Error handling directory change: ${error.message}`);
    }
  }

  private setupFileWatching(workingDir: string): void {
    try {
      if (this.directoryWatcher) {
        this.directoryWatcher.close();
        this.directoryWatcher = undefined;
      }
      
      // Only watch if it's a valid, accessible directory
      // fs already imported at top
      if (!fs.existsSync(workingDir) || !fs.statSync(workingDir).isDirectory()) {
        console.error(`[CodeGraph] Skipping file watching for invalid directory: ${workingDir}`);
        return;
      }
      
      this.directoryWatcher = chokidar.watch(workingDir, {
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/.codegraph/**",
          "**/dist/**",
          "**/build/**",
          "/dev/**",
          "/proc/**",
          "/sys/**"
        ],
        ignoreInitial: true,
        persistent: true,
        // Remove depth limit - scan all levels
        followSymlinks: false // Don't follow symlinks
      });
    
    this.directoryWatcher.on("change", (filePath) => {
      this.handleFileChange(filePath);
    });
    
    this.directoryWatcher.on("add", (filePath) => {
      this.handleFileAdd(filePath);
    });
    
    this.directoryWatcher.on("unlink", (filePath) => {
      this.handleFileDelete(filePath);
    });
    
    this.directoryWatcher.on("error", (error) => {
      console.error(`[CodeGraph] File watcher error: ${error.message}`);
    });
    } catch (error: any) {
      console.error(`[CodeGraph] Failed to setup file watching: ${error.message}`);
    }
  }

  private async handleFileChange(filePath: string): Promise<void> {
    if (this.autoIndexer.isIndexingComplete(this.currentWorkingDir!)) {
      await this.core.reindexFile(filePath);
    }
  }

  private async handleFileAdd(filePath: string): Promise<void> {
    if (this.autoIndexer.isIndexingComplete(this.currentWorkingDir!)) {
      await this.core.indexNewFile(filePath);
    }
  }

  private async handleFileDelete(filePath: string): Promise<void> {
    if (this.autoIndexer.isIndexingComplete(this.currentWorkingDir!)) {
      await this.core.removeFromIndex(filePath);
    }
  }

  private cleanup(): void {
    try {
      if (this.directoryWatcher) {
        this.directoryWatcher.close();
        this.directoryWatcher = undefined;
      }
      // Note: CodeGraph class doesn't have a close method currently
      // but we should clean up any other resources here
      console.error("[CodeGraph] Cleanup completed");
    } catch (error: any) {
      console.error(`[CodeGraph] Error during cleanup: ${error.message}`);
    }
  }

  async start(): Promise<void> {
    // Don't initialize core here - wait for project detection
    // This prevents creating a default database in the wrong location
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error("[CodeGraph] Server started successfully");
    console.error("[CodeGraph] Ready for Claude Code connections");
  }
}

const server = new CodeGraphMCPServer();
server.start().catch((error) => {
  console.error("[CodeGraph] Failed to start server:", error);
  process.exit(1);
});

// Add cleanup handlers for graceful shutdown
process.on('SIGINT', () => {
  console.error("[CodeGraph] Received SIGINT, shutting down...");
  (server as any).cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error("[CodeGraph] Received SIGTERM, shutting down...");
  (server as any).cleanup();
  process.exit(0);
});