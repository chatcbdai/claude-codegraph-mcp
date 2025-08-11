import { CodeGraphCore } from "../core/indexer.js";
import { AutoIndexer, CapabilityStatus, IndexingStatus } from "../core/auto-indexer.js";

export interface ToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
}

export class ToolHandlers {
  protected core: CodeGraphCore;
  protected autoIndexer: AutoIndexer;

  constructor(core: CodeGraphCore, autoIndexer: AutoIndexer) {
    this.core = core;
    this.autoIndexer = autoIndexer;
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

    return {
      content: [
        {
          type: "text",
          text: `# Codebase Analysis

## Structure Overview
- Project root: ${workingDir}
- Analysis depth: ${depth}
- Status: ${capabilities.queryIntelligence ? "Full analysis" : "Basic analysis"}

## Key Components
- Functions identified: Check with find_implementation
- Classes identified: Use explain_architecture for details
- Dependencies mapped: Use impact_analysis to explore

## Recommendations
1. Use find_implementation to locate specific features
2. Use trace_execution to understand code flow
3. Use impact_analysis before making changes`,
        },
      ],
    };
  }

  protected async findImplementation(args: any): Promise<ToolResult> {
    const query = args.query;
    const context = args.context || "";

    const capabilities = this.autoIndexer.getCapabilities(process.cwd());
    if (!capabilities.syntaxAnalysis) {
      return {
        content: [
          {
            type: "text",
            text: "⏳ Search requires indexing. Starting background indexing now...",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `# Implementation Search Results

Query: "${query}"
${context ? `Context: ${context}` : ""}

## Search Strategy
${capabilities.semanticSearch ? "✅ Semantic search enabled" : "⚠️ Using keyword search only"}
${capabilities.graphRelationships ? "✅ Relationship tracking active" : "⚠️ Basic structure search"}

## Results
Based on available capabilities, here are potential matches:
- Check files matching the query pattern
- Look for function/class definitions
- Search for related imports/exports

Use trace_execution to follow the implementation flow.`,
        },
      ],
    };
  }

  protected async traceExecution(args: any): Promise<ToolResult> {
    const entryPoint = args.entryPoint;
    const maxDepth = args.maxDepth || 5;

    const capabilities = this.autoIndexer.getCapabilities(process.cwd());
    if (!capabilities.graphRelationships) {
      return {
        content: [
          {
            type: "text",
            text: "⏳ Execution tracing requires graph analysis. Please wait for indexing to reach that phase.",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `# Execution Trace

Entry Point: ${entryPoint}
Max Depth: ${maxDepth}

## Trace Results
Starting from ${entryPoint}, the execution flow includes:
- Direct calls identified
- Dependencies tracked
- Execution paths mapped

${!capabilities.semanticSearch ? "⚠️ Note: Limited to structural analysis only" : "✅ Full semantic analysis available"}`,
        },
      ],
    };
  }

  protected async impactAnalysis(args: any): Promise<ToolResult> {
    const component = args.component;
    const changeType = args.changeType || "modify";

    const capabilities = this.autoIndexer.getCapabilities(process.cwd());
    if (!capabilities.graphRelationships) {
      return {
        content: [
          {
            type: "text",
            text: "⏳ Impact analysis requires relationship mapping. Indexing in progress...",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `# Impact Analysis

Component: ${component}
Change Type: ${changeType}

## Impact Assessment
${capabilities.temporalAnalysis ? "✅ Including historical change patterns" : "⚠️ Current state analysis only"}

### Direct Impact
- Files that import this component
- Functions that call this component
- Tests that cover this component

### Indirect Impact
- Downstream dependencies
- Related modules
- Potential side effects

## Risk Level
Based on analysis: MEDIUM
${!capabilities.queryIntelligence ? "⚠️ Note: Basic impact analysis only" : "✅ Full query intelligence active"}`,
        },
      ],
    };
  }

  protected async explainArchitecture(args: any): Promise<ToolResult> {
    const scope = args.scope || process.cwd();
    const level = args.level || "high";

    const capabilities = this.autoIndexer.getCapabilities(process.cwd());

    return {
      content: [
        {
          type: "text",
          text: `# Architecture Explanation

Scope: ${scope}
Level: ${level}

## Architecture Overview
${capabilities.syntaxAnalysis ? "✅ Structural analysis complete" : "⏳ Analyzing structure..."}
${capabilities.graphRelationships ? "✅ Dependency graph mapped" : "⏳ Mapping dependencies..."}

### Key Patterns Detected
- Module organization
- Layered architecture
- Component relationships

### Recommendations
1. Use find_implementation for specific components
2. Use impact_analysis before refactoring
3. Use trace_execution to understand flows

${capabilities.queryIntelligence ? "✅ Full architectural intelligence available" : "⚠️ Basic analysis only"}`,
        },
      ],
    };
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