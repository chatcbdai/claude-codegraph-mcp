import { CodeGraphCore } from "../core/indexer.js";
import { Logger } from "../utils/logger.js";

export type QueryIntent = 
  | "architecture"
  | "implementation"
  | "flow"
  | "impact"
  | "evolution"
  | "relationship"
  | "general";

export type Strategy = string[];

export interface QueryContext {
  workingDir: string;
  limit?: number;
  depth?: number;
  includeTests?: boolean;
  includeExamples?: boolean;
}

export interface RoutedQuery {
  intent: QueryIntent;
  strategy: Strategy;
  plan: QueryPlan;
  execute: () => Promise<any>;
}

export interface QueryPlan {
  steps: QueryStep[];
  estimatedTime: number;
  requiredCapabilities: string[];
}

export interface QueryStep {
  type: string;
  action: string;
  params: any;
  fallback?: QueryStep;
}

export class QueryRouter {
  private logger: Logger;
  private core: CodeGraphCore;

  constructor(core: CodeGraphCore) {
    this.core = core;
    this.logger = new Logger("QueryRouter");
  }

  async route(query: string, context: QueryContext): Promise<RoutedQuery> {
    const intent = await this.classifyIntent(query);
    const strategy = this.selectStrategy(intent, context);
    const plan = this.buildQueryPlan(strategy, query, context);

    return {
      intent,
      strategy,
      plan,
      execute: () => this.executePlan(plan),
    };
  }

  async classifyIntent(query: string): Promise<QueryIntent> {
    const patterns = {
      architecture: /architecture|structure|design|pattern|module|layer/i,
      implementation: /where|implement|define|located|find|search/i,
      flow: /flow|execution|trace|path|call|sequence/i,
      impact: /impact|affect|change|modify|depend|break/i,
      evolution: /history|evolution|changed|refactor|version|commit/i,
      relationship: /relate|depend|connect|use|import|export/i,
    };

    for (const [intent, pattern] of Object.entries(patterns)) {
      if (pattern.test(query)) {
        return intent as QueryIntent;
      }
    }

    return this.llmClassify(query);
  }

  private async llmClassify(query: string): Promise<QueryIntent> {
    // Fallback classification based on keywords
    const keywords = query.toLowerCase().split(/\W+/);
    
    if (keywords.some(k => ["class", "function", "method", "variable"].includes(k))) {
      return "implementation";
    }
    
    if (keywords.some(k => ["flow", "trace", "call", "execute"].includes(k))) {
      return "flow";
    }
    
    if (keywords.some(k => ["change", "impact", "affect", "modify"].includes(k))) {
      return "impact";
    }
    
    return "general";
  }

  selectStrategy(intent: QueryIntent, context: QueryContext): Strategy {
    const strategies: Record<QueryIntent, Strategy> = {
      architecture: ["graph", "structural", "semantic"],
      implementation: ["semantic", "graph", "keyword"],
      flow: ["graph", "temporal", "structural"],
      impact: ["graph", "structural", "temporal"],
      evolution: ["temporal", "graph", "semantic"],
      relationship: ["graph", "semantic", "structural"],
      general: ["semantic", "keyword", "graph"],
    };

    return strategies[intent] || ["semantic", "keyword"];
  }

  buildQueryPlan(strategy: Strategy, query: string, context: QueryContext): QueryPlan {
    const steps: QueryStep[] = [];
    let estimatedTime = 0;
    const requiredCapabilities: string[] = [];

    for (const strat of strategy) {
      switch (strat) {
        case "semantic":
          steps.push({
            type: "search",
            action: "semantic_search",
            params: { query, limit: context.limit || 20 },
            fallback: {
              type: "search",
              action: "keyword_search",
              params: { query, limit: context.limit || 20 },
            },
          });
          estimatedTime += 200;
          requiredCapabilities.push("semanticSearch");
          break;

        case "graph":
          steps.push({
            type: "traverse",
            action: "graph_traversal",
            params: { query, depth: context.depth || 3 },
          });
          estimatedTime += 300;
          requiredCapabilities.push("graphRelationships");
          break;

        case "structural":
          steps.push({
            type: "analyze",
            action: "structural_analysis",
            params: { query, includeTests: context.includeTests },
          });
          estimatedTime += 150;
          requiredCapabilities.push("syntaxAnalysis");
          break;

        case "temporal":
          steps.push({
            type: "history",
            action: "temporal_analysis",
            params: { query, days: 30 },
          });
          estimatedTime += 400;
          requiredCapabilities.push("temporalAnalysis");
          break;

        case "keyword":
          steps.push({
            type: "search",
            action: "keyword_search",
            params: { query, limit: context.limit || 20 },
          });
          estimatedTime += 100;
          break;
      }
    }

    // Add result aggregation step
    steps.push({
      type: "aggregate",
      action: "merge_results",
      params: { strategy, query },
    });

    return {
      steps,
      estimatedTime,
      requiredCapabilities,
    };
  }

  async executePlan(plan: QueryPlan): Promise<any> {
    const results: any[] = [];
    
    for (const step of plan.steps) {
      try {
        const result = await this.executeStep(step);
        results.push(result);
      } catch (error: any) {
        this.logger.warn(`Step failed: ${step.action} - ${error.message}`);
        
        if (step.fallback) {
          try {
            const fallbackResult = await this.executeStep(step.fallback);
            results.push(fallbackResult);
          } catch (fallbackError: any) {
            this.logger.error(`Fallback also failed: ${fallbackError.message}`);
          }
        }
      }
    }
    
    return this.aggregateResults(results);
  }

  private async executeStep(step: QueryStep): Promise<any> {
    switch (step.action) {
      case "semantic_search":
        return await this.semanticSearch(step.params);
      case "keyword_search":
        return await this.keywordSearch(step.params);
      case "graph_traversal":
        return await this.graphTraversal(step.params);
      case "structural_analysis":
        return await this.structuralAnalysis(step.params);
      case "temporal_analysis":
        return await this.temporalAnalysis(step.params);
      case "merge_results":
        return step.params;
      default:
        throw new Error(`Unknown action: ${step.action}`);
    }
  }

  private async semanticSearch(params: any): Promise<any> {
    // Placeholder for semantic search
    return {
      type: "semantic",
      query: params.query,
      results: [],
    };
  }

  private async keywordSearch(params: any): Promise<any> {
    // Placeholder for keyword search
    return {
      type: "keyword",
      query: params.query,
      results: [],
    };
  }

  private async graphTraversal(params: any): Promise<any> {
    // Placeholder for graph traversal
    return {
      type: "graph",
      query: params.query,
      nodes: [],
      edges: [],
    };
  }

  private async structuralAnalysis(params: any): Promise<any> {
    // Placeholder for structural analysis
    return {
      type: "structural",
      query: params.query,
      structure: {},
    };
  }

  private async temporalAnalysis(params: any): Promise<any> {
    // Placeholder for temporal analysis
    return {
      type: "temporal",
      query: params.query,
      history: [],
    };
  }

  private aggregateResults(results: any[]): any {
    return {
      query: results[results.length - 1]?.query || "",
      results: results.filter(r => r.type !== "aggregate"),
      strategies: results.map(r => r.type).filter(t => t !== "aggregate"),
      totalResults: results.reduce((sum, r) => sum + (r.results?.length || 0), 0),
    };
  }

  async optimizeQuery(query: string): Promise<string> {
    // Query optimization logic
    const optimized = query
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    
    return optimized;
  }

  async expandQuery(query: string): Promise<string[]> {
    // Query expansion with synonyms and related terms
    const expanded = [query];
    
    const synonyms: Record<string, string[]> = {
      "function": ["method", "procedure", "routine"],
      "class": ["type", "struct", "interface"],
      "import": ["include", "require", "use"],
      "export": ["expose", "provide", "public"],
    };
    
    for (const [term, syns] of Object.entries(synonyms)) {
      if (query.includes(term)) {
        for (const syn of syns) {
          expanded.push(query.replace(term, syn));
        }
      }
    }
    
    return expanded;
  }
}