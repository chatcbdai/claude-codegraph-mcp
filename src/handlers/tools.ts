import { CodeGraphCore } from "../core/indexer.js";
import { AutoIndexer, CapabilityStatus, IndexingStatus } from "../core/auto-indexer.js";
import { CodeGraph } from "../core/graph.js";
import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs/promises";
import crypto from "crypto";
import {
  findImplementationReal,
  traceExecutionReal,
  impactAnalysisReal,
  explainArchitectureReal
} from "./tools-implementation.js";

export interface ToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
}

export class ToolHandlers {
  protected core: CodeGraphCore;
  protected autoIndexer: AutoIndexer;
  protected graph: CodeGraph;

  constructor(core: CodeGraphCore, autoIndexer: AutoIndexer) {
    this.core = core;
    this.autoIndexer = autoIndexer;
    this.graph = new CodeGraph({ type: "sqlite" });
  }

  getTools() {
    return [
      {
        name: "get_indexing_status",
        description: "Get current indexing status and progress for the codebase",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Working directory path (defaults to current directory)",
            },
          },
        },
      },
      {
        name: "get_capabilities",
        description: "Get available CodeGraph capabilities for the current codebase",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Working directory path (defaults to current directory)",
            },
          },
        },
      },
      {
        name: "wait_for_indexing",
        description: "Wait for indexing to complete before proceeding with code analysis",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Working directory path (defaults to current directory)",
            },
            maxWaitTime: {
              type: "number",
              description: "Maximum time to wait in seconds (default: 300)",
            },
          },
        },
      },
      {
        name: "analyze_codebase",
        description: "Analyze entire codebase structure and relationships",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to codebase",
            },
            depth: {
              type: "number",
              description: "Analysis depth (1-5)",
            },
          },
        },
      },
      {
        name: "find_implementation",
        description: "Find where something is implemented in the codebase",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "What to find",
            },
            context: {
              type: "string",
              description: "Additional context",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "trace_execution",
        description: "Trace execution flow through the codebase",
        inputSchema: {
          type: "object",
          properties: {
            entryPoint: {
              type: "string",
              description: "Starting point (function or file)",
            },
            maxDepth: {
              type: "number",
              description: "Max call depth",
            },
          },
          required: ["entryPoint"],
        },
      },
      {
        name: "impact_analysis",
        description: "Analyze impact of changing a component",
        inputSchema: {
          type: "object",
          properties: {
            component: {
              type: "string",
              description: "Component to analyze",
            },
            changeType: {
              type: "string",
              enum: ["modify", "delete", "rename"],
              description: "Type of change",
            },
          },
          required: ["component"],
        },
      },
      {
        name: "explain_architecture",
        description: "Explain the architecture of a module or system",
        inputSchema: {
          type: "object",
          properties: {
            scope: {
              type: "string",
              description: "Module or directory",
            },
            level: {
              type: "string",
              enum: ["high", "detailed"],
              description: "Level of detail",
            },
          },
        },
      },
    ];
  }

  async handleToolCall(name: string, args: any): Promise<ToolResult> {
    switch (name) {
      case "get_indexing_status":
        return await this.getIndexingStatus(args);
      case "get_capabilities":
        return await this.getCapabilities(args);
      case "wait_for_indexing":
        return await this.waitForIndexing(args);
      case "analyze_codebase":
        return await this.analyzeCodebase(args);
      case "find_implementation":
        return await this.findImplementation(args);
      case "trace_execution":
        return await this.traceExecution(args);
      case "impact_analysis":
        return await this.impactAnalysis(args);
      case "explain_architecture":
        return await this.explainArchitecture(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  protected async getIndexingStatus(args: any): Promise<ToolResult> {
    try {
      const workingDir = args.path || process.cwd();
      const status = this.autoIndexer.getStatus(workingDir);

      if (!status) {
        return {
          content: [
            {
              type: "text",
              text: "No indexing information available for this directory. CodeGraph may not be active.",
            },
          ],
        };
      }

      const statusMessage = this.formatIndexingStatus(status);

      return {
        content: [
          {
            type: "text",
            text: statusMessage,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting indexing status: ${error.message}`,
          },
        ],
      };
    }
  }

  protected async getCapabilities(args: any): Promise<ToolResult> {
    try {
      const workingDir = args.path || process.cwd();
      const capabilities = this.autoIndexer.getCapabilities(workingDir);
      const status = this.autoIndexer.getStatus(workingDir);

      const capabilityMessage = this.formatCapabilities(capabilities, status);

      return {
        content: [
          {
            type: "text",
            text: capabilityMessage,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting capabilities: ${error.message}`,
          },
        ],
      };
    }
  }

  protected async waitForIndexing(args: any): Promise<ToolResult> {
    try {
      const workingDir = args.path || process.cwd();
      const maxWaitTime = args.maxWaitTime || 300;

      const isComplete = await this.waitForIndexingComplete(
        workingDir,
        maxWaitTime
      );

      if (isComplete) {
        return {
          content: [
            {
              type: "text",
              text: "✅ Indexing complete! CodeGraph is now ready with full codebase intelligence.",
            },
          ],
        };
      } else {
        const status = this.autoIndexer.getStatus(workingDir);
        return {
          content: [
            {
              type: "text",
              text: `⏳ Indexing still in progress (${status?.progress}% complete). You can continue with basic assistance, or wait longer for full capabilities.`,
            },
          ],
        };
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error waiting for indexing: ${error.message}`,
          },
        ],
      };
    }
  }

  protected async analyzeCodebase(args: any): Promise<ToolResult> {
    const workingDir = args.path || process.cwd();
    const depth = args.depth || 3;

    const capabilities = this.autoIndexer.getCapabilities(workingDir);
    if (!capabilities.syntaxAnalysis) {
      return {
        content: [
          {
            type: "text",
            text: "⏳ Codebase analysis requires indexing to complete first. Please wait or use 'wait_for_indexing' tool.",
          },
        ],
      };
    }

    try {
      // Get the actual database path for this project
      const projectHash = crypto.createHash('md5').update(workingDir).digest('hex').substring(0, 8);
      const projectName = path.basename(workingDir);
      const safeProjectName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_');
      const dbPath = path.join(os.homedir(), ".codegraph", "projects", `${safeProjectName}_${projectHash}`, "graph.db");
      
      // Check if database exists
      try {
        await fs.access(dbPath);
      } catch {
        return {
          content: [
            {
              type: "text",
              text: "Database not found. Please ensure indexing has completed.",
            },
          ],
        };
      }

      // Query the actual database
      const db = new Database(dbPath, { readonly: true });
      
      // Get actual statistics from the database
      const fileCount = db.prepare("SELECT COUNT(DISTINCT file) as count FROM nodes").get() as any;
      const functionCount = db.prepare("SELECT COUNT(*) as count FROM nodes WHERE type = 'function'").get() as any;
      const classCount = db.prepare("SELECT COUNT(*) as count FROM nodes WHERE type = 'class'").get() as any;
      const relationshipCount = db.prepare("SELECT COUNT(*) as count FROM relationships").get() as any;
      
      // Get language distribution
      const languages = db.prepare(`
        SELECT json_extract(metadata, '$.language') as language, COUNT(*) as count 
        FROM nodes 
        WHERE type = 'file' AND metadata IS NOT NULL 
        GROUP BY language
      `).all() as any[];
      
      // Get most connected nodes (important components)
      const importantNodes = db.prepare(`
        SELECT n.name, n.type, n.file, COUNT(r.id) as connections
        FROM nodes n
        LEFT JOIN relationships r ON n.id = r.from_node OR n.id = r.to_node
        GROUP BY n.id
        ORDER BY connections DESC
        LIMIT 10
      `).all() as any[];
      
      // Get files with most functions/classes
      const complexFiles = db.prepare(`
        SELECT file, COUNT(*) as components
        FROM nodes
        WHERE type IN ('function', 'class')
        GROUP BY file
        ORDER BY components DESC
        LIMIT 5
      `).all() as any[];
      
      db.close();
      
      // Format the actual data
      const languageList = languages
        .filter(l => l.language)
        .map(l => `${l.language}: ${l.count} files`)
        .join(", ") || "No language data available";
      
      const importantNodesList = importantNodes
        .slice(0, 5)
        .map(n => `- **${n.name}** (${n.type}): ${n.connections} connections`)
        .join("\n") || "- No components found";
      
      const complexFilesList = complexFiles
        .map(f => `- ${f.file}: ${f.components} components`)
        .join("\n") || "- No complex files found";
      
      return {
        content: [
          {
            type: "text",
            text: `# Codebase Analysis

## Project Overview
- **Location**: ${workingDir}
- **Total Files**: ${fileCount?.count || 0}
- **Functions**: ${functionCount?.count || 0}
- **Classes**: ${classCount?.count || 0}
- **Relationships**: ${relationshipCount?.count || 0}

## Language Distribution
${languageList}

## Most Connected Components
These are the most important nodes in your codebase based on relationships:
${importantNodesList}

## Most Complex Files
Files with the most functions and classes:
${complexFilesList}

## Analysis Capabilities
- ✅ Syntax Analysis: ${capabilities.syntaxAnalysis ? "Available" : "Not available"}
- ${capabilities.graphRelationships ? "✅" : "⏳"} Graph Relationships: ${capabilities.graphRelationships ? "Available" : "Building..."}
- ${capabilities.semanticSearch ? "✅" : "⏳"} Semantic Search: ${capabilities.semanticSearch ? "Available" : "Processing..."}
- ${capabilities.temporalAnalysis ? "✅" : "⏳"} Temporal Analysis: ${capabilities.temporalAnalysis ? "Available" : "Analyzing..."}
- ${capabilities.queryIntelligence ? "✅" : "⏳"} Query Intelligence: ${capabilities.queryIntelligence ? "Available" : "Training..."}

## Recommendations
1. ${functionCount?.count > 100 ? "Consider modularizing - you have many functions" : "Good function organization"}
2. ${complexFiles.length > 0 && complexFiles[0].components > 20 ? `Refactor ${complexFiles[0].file} - it has ${complexFiles[0].components} components` : "File complexity is manageable"}
3. Use 'find_implementation' to locate specific features
4. Use 'trace_execution' to understand code flow
5. Use 'impact_analysis' before making changes`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error analyzing codebase: ${error.message}\n\nMake sure indexing has completed for this project.`,
          },
        ],
      };
    }
  }

  protected async findImplementation(args: any): Promise<ToolResult> {
    return findImplementationReal(args, this.autoIndexer);
  }

  protected async traceExecution(args: any): Promise<ToolResult> {
    return traceExecutionReal(args, this.autoIndexer, this.graph);
  }

  protected async impactAnalysis(args: any): Promise<ToolResult> {
    return impactAnalysisReal(args, this.autoIndexer, this.graph);
  }

  protected async explainArchitecture(args: any): Promise<ToolResult> {
    return explainArchitectureReal(args, this.autoIndexer);
  }

  protected formatIndexingStatus(status: IndexingStatus): string {
    if (status.error) {
      return `❌ **Indexing Error**\n\nError: ${status.error}\n\nPlease check the logs and try restarting.`;
    }

    if (status.isComplete) {
      return `✅ **CodeGraph Ready**\n\nIndexing complete! Full codebase intelligence is available.\n\n**Available Capabilities:**\n${this.formatCapabilityList(
        status.capabilities
      )}`;
    }

    if (status.isIndexing) {
      const progressBar = this.createProgressBar(status.progress);
      return `⏳ **Indexing in Progress**\n\n${progressBar} ${
        status.progress
      }%\n\n**Current Phase:** ${status.currentPhase}\n**Files Processed:** ${
        status.filesProcessed
      }/${status.totalFiles}\n\n**Available Now:**\n${this.formatCapabilityList(
        status.capabilities
      )}\n\n*You can continue working - I'll get smarter as indexing progresses!*`;
    }

    return "ℹ️ **No Active Indexing**\n\nCodeGraph is ready to start indexing when needed.";
  }

  protected formatCapabilities(
    capabilities: CapabilityStatus,
    status?: IndexingStatus | null
  ): string {
    const capList = this.formatCapabilityList(capabilities);

    if (status?.isIndexing) {
      return `**Currently Available:**\n${capList}\n\n*More capabilities coming as indexing progresses...*`;
    }

    return `**Available Capabilities:**\n${capList}`;
  }

  protected formatCapabilityList(capabilities: CapabilityStatus): string {
    const items = [
      {
        name: "Syntax Analysis",
        available: capabilities.syntaxAnalysis,
        desc: "Code parsing and structure understanding",
      },
      {
        name: "Graph Relationships",
        available: capabilities.graphRelationships,
        desc: "Function calls, imports, and dependencies",
      },
      {
        name: "Semantic Search",
        available: capabilities.semanticSearch,
        desc: "Intelligent code search and similarity",
      },
      {
        name: "Temporal Analysis",
        available: capabilities.temporalAnalysis,
        desc: "Git history and evolution patterns",
      },
      {
        name: "Query Intelligence",
        available: capabilities.queryIntelligence,
        desc: "Advanced query routing and context building",
      },
    ];

    return items
      .map(
        (item) =>
          `${item.available ? "✅" : "⏳"} **${item.name}**: ${item.desc}`
      )
      .join("\n");
  }

  protected createProgressBar(progress: number): string {
    const width = 20;
    const filled = Math.floor((progress / 100) * width);
    const empty = width - filled;
    return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
  }

  protected async waitForIndexingComplete(
    workingDir: string,
    maxWaitSeconds: number
  ): Promise<boolean> {
    const startTime = Date.now();
    const maxWaitMs = maxWaitSeconds * 1000;

    while (Date.now() - startTime < maxWaitMs) {
      if (this.autoIndexer.isIndexingComplete(workingDir)) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return false;
  }
}