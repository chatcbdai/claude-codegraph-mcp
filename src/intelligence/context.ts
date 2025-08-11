import { CodeGraphCore } from "../core/indexer.js";
import { CodeGraph, CodeNode } from "../core/graph.js";
import { EmbeddingEngine } from "../core/embeddings.js";
import { TemporalAnalyzer } from "./temporal.js";
import { Logger } from "../utils/logger.js";

export enum Priority {
  CRITICAL = 4,
  HIGH = 3,
  MEDIUM = 2,
  LOW = 1,
}

export interface ContextItem {
  node: CodeNode;
  priority: Priority;
  relevance: number;
  reason: string;
}

export class Context {
  private items: ContextItem[] = [];
  private maxTokens: number;
  private currentTokens: number = 0;

  constructor(maxTokens: number) {
    this.maxTokens = maxTokens;
  }

  add(node: CodeNode, priority: Priority, relevance: number = 1, reason: string = ""): void {
    const estimatedTokens = this.estimateTokens(node.content);
    
    if (this.currentTokens + estimatedTokens <= this.maxTokens) {
      this.items.push({ node, priority, relevance, reason });
      this.currentTokens += estimatedTokens;
    }
  }

  hasSpace(): boolean {
    return this.currentTokens < this.maxTokens * 0.9;
  }

  optimize(): Context {
    // Sort by priority and relevance
    this.items.sort((a, b) => {
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return b.relevance - a.relevance;
    });

    // Reorder for coherence
    const optimized = this.reorderForCoherence(this.items);
    this.items = optimized;

    return this;
  }

  private reorderForCoherence(items: ContextItem[]): ContextItem[] {
    // Group by file
    const byFile = new Map<string, ContextItem[]>();
    
    for (const item of items) {
      const file = item.node.file;
      if (!byFile.has(file)) {
        byFile.set(file, []);
      }
      byFile.get(file)!.push(item);
    }

    // Reorder within files
    const reordered: ContextItem[] = [];
    for (const [_, fileItems] of byFile) {
      fileItems.sort((a, b) => {
        // Sort by position in file if available
        const aLine = a.node.metadata?.startLine || 0;
        const bLine = b.node.metadata?.startLine || 0;
        return aLine - bLine;
      });
      reordered.push(...fileItems);
    }

    return reordered;
  }

  private estimateTokens(content: string): number {
    // Rough estimation: 1 token per 4 characters
    return Math.ceil(content.length / 4);
  }

  getItems(): ContextItem[] {
    return this.items;
  }

  toString(): string {
    const sections: string[] = [];
    
    // Group by file for better readability
    const byFile = new Map<string, ContextItem[]>();
    for (const item of this.items) {
      const file = item.node.file;
      if (!byFile.has(file)) {
        byFile.set(file, []);
      }
      byFile.get(file)!.push(item);
    }

    for (const [file, items] of byFile) {
      sections.push(`\n=== ${file} ===\n`);
      for (const item of items) {
        if (item.reason) {
          sections.push(`# ${item.reason}\n`);
        }
        sections.push(item.node.content);
        sections.push("\n");
      }
    }

    return sections.join("\n");
  }
}

export class ContextBuilder {
  private core: CodeGraphCore;
  private graph: CodeGraph;
  private embeddings: EmbeddingEngine;
  private temporal?: TemporalAnalyzer;
  private logger: Logger;

  constructor(
    core: CodeGraphCore,
    graph: CodeGraph,
    embeddings: EmbeddingEngine,
    temporal?: TemporalAnalyzer
  ) {
    this.core = core;
    this.graph = graph;
    this.embeddings = embeddings;
    this.temporal = temporal;
    this.logger = new Logger("ContextBuilder");
  }

  async buildProgressiveContext(
    query: string,
    startPoint: CodeNode,
    maxTokens: number
  ): Promise<Context> {
    const context = new Context(maxTokens);

    // Layer 1: Direct context (the starting point itself)
    context.add(startPoint, Priority.CRITICAL, 1, "Primary focus");

    // Layer 2: Immediate dependencies
    if (context.hasSpace()) {
      const deps = await this.getDirectDependencies(startPoint.id);
      for (const dep of deps) {
        if (!context.hasSpace()) break;
        context.add(dep, Priority.HIGH, 0.9, "Direct dependency");
      }
    }

    // Layer 3: Related by semantic similarity
    if (context.hasSpace()) {
      const similar = await this.findSimilar(startPoint);
      for (const node of similar) {
        if (!context.hasSpace()) break;
        context.add(node, Priority.MEDIUM, node.similarity || 0.5, "Similar code");
      }
    }

    // Layer 4: Historical context
    if (context.hasSpace() && this.temporal) {
      const history = await this.getRecentChanges(startPoint);
      for (const change of history) {
        if (!context.hasSpace()) break;
        context.add(change, Priority.LOW, 0.3, "Recent change");
      }
    }

    return context.optimize();
  }

  async buildQueryContext(query: string, maxTokens: number): Promise<Context> {
    const context = new Context(maxTokens);

    // Find relevant nodes based on query
    const relevantNodes = await this.findRelevantNodes(query);

    for (const node of relevantNodes) {
      if (!context.hasSpace()) break;
      
      const priority = this.determinePriority(node);
      const relevance = await this.calculateRelevance(query, node);
      
      context.add(node, priority, relevance, `Relevant to: ${query}`);
    }

    return context.optimize();
  }

  async buildImpactContext(
    component: string,
    changeType: string,
    maxTokens: number
  ): Promise<Context> {
    const context = new Context(maxTokens);

    // Find the component
    const componentNode = await this.findComponent(component);
    if (!componentNode) {
      this.logger.warn(`Component not found: ${component}`);
      return context;
    }

    // Add the component itself
    context.add(componentNode, Priority.CRITICAL, 1, "Component being changed");

    // Add direct dependents
    const dependents = await this.graph.findRelated(componentNode.id, 2);
    for (const dep of dependents) {
      if (!context.hasSpace()) break;
      context.add(dep, Priority.HIGH, 0.8, "Directly affected");
    }

    // Add test files
    const tests = await this.findTests(component);
    for (const test of tests) {
      if (!context.hasSpace()) break;
      context.add(test, Priority.MEDIUM, 0.7, "Test coverage");
    }

    return context.optimize();
  }

  private async getDirectDependencies(nodeId: string): Promise<CodeNode[]> {
    try {
      return await this.graph.findRelated(nodeId, 1);
    } catch (error: any) {
      this.logger.error(`Failed to get dependencies: ${error.message}`);
      return [];
    }
  }

  private async findSimilar(node: CodeNode): Promise<any[]> {
    try {
      if (!node.content) return [];
      
      const embedding = await this.embeddings.embed(node.content);
      const similar = await this.graph.searchByEmbedding(embedding, 10);
      
      return similar.filter(s => s.id !== node.id);
    } catch (error: any) {
      this.logger.error(`Failed to find similar nodes: ${error.message}`);
      return [];
    }
  }

  private async getRecentChanges(node: CodeNode): Promise<CodeNode[]> {
    if (!this.temporal) return [];

    try {
      const history = await this.temporal.getFileHistory(node.file);
      
      // Convert history to nodes
      const nodes: CodeNode[] = [];
      for (const change of history.slice(0, 5)) {
        const content = await this.temporal.getContextAtCommit(node.file, change.commit);
        if (content) {
          nodes.push({
            id: `${node.id}_${change.commit}`,
            type: "historical",
            name: node.name,
            file: node.file,
            content: content,
            metadata: {
              commit: change.commit,
              date: change.date,
              author: change.author,
            },
          });
        }
      }
      
      return nodes;
    } catch (error: any) {
      this.logger.error(`Failed to get recent changes: ${error.message}`);
      return [];
    }
  }

  private async findRelevantNodes(query: string): Promise<CodeNode[]> {
    try {
      const queryEmbedding = await this.embeddings.embed(query);
      const nodes = await this.graph.searchByEmbedding(queryEmbedding, 20);
      
      return nodes.map(n => ({
        id: n.id,
        type: n.type,
        name: n.name,
        file: n.file,
        content: n.content,
        metadata: n.metadata,
        similarity: n.similarity,
      }));
    } catch (error: any) {
      this.logger.error(`Failed to find relevant nodes: ${error.message}`);
      return [];
    }
  }

  private determinePriority(node: any): Priority {
    if (node.type === "class" || node.type === "interface") {
      return Priority.HIGH;
    }
    if (node.type === "function" || node.type === "method") {
      return Priority.MEDIUM;
    }
    return Priority.LOW;
  }

  private async calculateRelevance(query: string, node: CodeNode): Promise<number> {
    try {
      const queryEmbedding = await this.embeddings.embed(query);
      const nodeEmbedding = await this.embeddings.embed(node.content);
      
      return this.embeddings.cosineSimilarity(queryEmbedding, nodeEmbedding);
    } catch {
      return 0.5;
    }
  }

  private async findComponent(name: string): Promise<CodeNode | null> {
    // Simple search by name
    const nodes = await this.findRelevantNodes(name);
    return nodes.find(n => n.name === name || n.name.includes(name)) || null;
  }

  private async findTests(component: string): Promise<CodeNode[]> {
    // Find test files related to the component
    const testPatterns = [
      `${component}.test`,
      `${component}.spec`,
      `test_${component}`,
      `${component}_test`,
    ];

    const tests: CodeNode[] = [];
    for (const pattern of testPatterns) {
      const nodes = await this.findRelevantNodes(pattern);
      tests.push(...nodes);
    }

    return tests;
  }
}