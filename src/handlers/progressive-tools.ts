import { ToolResult, ToolHandlers } from "./tools.js";
import { AutoIndexer, CapabilityStatus, IndexingStatus } from "../core/auto-indexer.js";
import { CodeGraphCore } from "../core/indexer.js";
import {
  findImplementationReal,
  traceExecutionReal,
  impactAnalysisReal,
  explainArchitectureReal
} from "./tools-implementation.js";

export class ProgressiveToolHandlers extends ToolHandlers {
  constructor(core: CodeGraphCore, autoIndexer: AutoIndexer) {
    super(core, autoIndexer);
  }

  async handleToolCall(name: string, args: any): Promise<ToolResult> {
    const workingDir = args.path || process.cwd();
    const capabilities = this.autoIndexer.getCapabilities(workingDir);
    const status = this.autoIndexer.getStatus(workingDir);

    switch (name) {
      case "analyze_codebase":
        // Try calling the real implementation first - it will check for database existence
        const analysisResult = await super.analyzeCodebase(args);
        
        // If it returned "Database not found", pass it through
        if (analysisResult.content[0].text.includes("Database not found")) {
          return analysisResult;
        }
        
        // Otherwise check for progressive enhancement
        if (!capabilities.syntaxAnalysis) {
          return {
            content: [
              {
                type: "text",
                text: "⏳ **Codebase Analysis Starting**\n\nI'm currently analyzing your codebase structure. This will take a few minutes.\n\nI can provide basic assistance now, but for comprehensive analysis, please wait for indexing to complete.\n\n*Use `get_indexing_status` to track progress.*",
              },
            ],
          };
        }
        
        // Add progressive enhancement notice if still indexing
        if (status?.isIndexing && !capabilities.queryIntelligence) {
          const text = analysisResult.content[0].text + 
            `\n\n*📈 **Enhancement in Progress**: Indexing is ${status.progress}% complete. Analysis will become more comprehensive as indexing progresses.*`;
          return {
            content: [{ type: "text", text }]
          };
        }
        return analysisResult;
        
      case "find_implementation":
        // Use real implementation with capability check
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
        const findResult = await findImplementationReal(args, this.autoIndexer);
        
        // Add progressive enhancement note if still indexing
        if (status?.isIndexing && !capabilities.semanticSearch) {
          const text = findResult.content[0].text + 
            `\n\n*⚡ **Search Enhancement**: Currently using ${capabilities.graphRelationships ? 'graph' : 'basic'} search. Full semantic search will be available when indexing completes (${status.progress}% done).*`;
          return {
            content: [{ type: "text", text }]
          };
        }
        return findResult;
        
      case "trace_execution":
        // Check capabilities and use real implementation
        if (!capabilities.graphRelationships) {
          return {
            content: [
              {
                type: "text",
                text: "⏳ **Execution Tracing Requires Graph Analysis**\n\nI'm still building the relationship graph for your codebase. Execution tracing will be available once graph analysis completes.\n\n*Current progress: Building code relationships...*\n\nFor now, I can help with basic code navigation and syntax analysis.",
              },
            ],
          };
        }
        const traceResult = await traceExecutionReal(args, this.autoIndexer, this.graph);
        
        // Add depth limitation notice if semantic search not available
        if (!capabilities.semanticSearch) {
          const text = traceResult.content[0].text + 
            `\n\n*📊 **Trace Depth Limited**: Full deep tracing will be available when semantic analysis completes.*`;
          return {
            content: [{ type: "text", text }]
          };
        }
        return traceResult;
        
      case "impact_analysis":
        // Check capabilities and use real implementation
        if (!capabilities.graphRelationships) {
          return {
            content: [
              {
                type: "text",
                text: "⏳ **Impact Analysis Requires Relationship Mapping**\n\nI need to complete the relationship analysis before I can assess change impact.\n\n*Currently building dependency graph...*\n\nI can provide basic syntax-level analysis for now.",
              },
            ],
          };
        }
        const impactResult = await impactAnalysisReal(args, this.autoIndexer, this.graph);
        
        // Add temporal analysis notice if not available
        if (!capabilities.temporalAnalysis) {
          const text = impactResult.content[0].text + 
            `\n\n*🔍 **Enhanced Analysis Coming**: Adding historical change patterns when temporal analysis completes.*`;
          return {
            content: [{ type: "text", text }]
          };
        }
        return impactResult;
        
      case "explain_architecture":
        // Always use real implementation, it handles missing data gracefully
        const archResult = await explainArchitectureReal(args, this.autoIndexer);
        
        // Add progress notice if still indexing
        if (status?.isIndexing) {
          const text = archResult.content[0].text + 
            `\n\n*🏗️ **Architecture Understanding Improving**: ${status.progress}% indexed. More detailed architectural insights coming as analysis progresses.*`;
          return {
            content: [{ type: "text", text }]
          };
        }
        return archResult;
        
      default:
        // For all other tools, use the parent implementation
        return await super.handleToolCall(name, args);
    }
  }
}