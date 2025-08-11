import { EmbeddingEngine } from "../core/embeddings.js";
import { CodeGraph } from "../core/graph.js";
import { Logger } from "../utils/logger.js";

export interface SearchContext {
  workingDir: string;
  limit: number;
  fileTypes?: string[];
  excludePaths?: string[];
}

export interface SearchResult {
  id: string;
  content: string;
  file: string;
  score: number;
  type: string;
  metadata?: any;
}

export class HybridSearch {
  private embeddings: EmbeddingEngine;
  private graph: CodeGraph;
  private logger: Logger;

  constructor(embeddings: EmbeddingEngine, graph: CodeGraph) {
    this.embeddings = embeddings;
    this.graph = graph;
    this.logger = new Logger("HybridSearch");
  }

  async search(query: string, context: SearchContext): Promise<SearchResult[]> {
    // Strategy 1: Embedding-based search
    const semanticResults = await this.semanticSearch(query, context);

    // Strategy 2: Keyword search (BM25)
    const keywordResults = await this.keywordSearch(query, context);

    // Strategy 3: Graph-based search
    const graphResults = await this.graphSearch(query, context);

    // Combine and re-rank
    return this.fuseResults(semanticResults, keywordResults, graphResults);
  }

  private async semanticSearch(
    query: string,
    context: SearchContext
  ): Promise<SearchResult[]> {
    try {
      const queryEmbedding = await this.embeddings.embed(query);

      // Search in vector store
      const candidates = await this.graph.searchByEmbedding(
        queryEmbedding,
        context.limit * 3 // Over-fetch for re-ranking
      );

      // Re-rank based on context
      const reranked = await this.contextualRerank(candidates, context);

      return reranked.map((c) => ({
        id: c.id,
        content: c.content || "",
        file: c.file,
        score: c.similarity || 0,
        type: "semantic",
        metadata: c.metadata,
      }));
    } catch (error: any) {
      this.logger.error(`Semantic search failed: ${error.message}`);
      return [];
    }
  }

  private async keywordSearch(
    query: string,
    context: SearchContext
  ): Promise<SearchResult[]> {
    try {
      // Split query into keywords
      const keywords = this.extractKeywords(query);

      // Search for each keyword
      const results: SearchResult[] = [];
      const seen = new Set<string>();

      for (const keyword of keywords) {
        const matches = await this.searchByKeyword(keyword, context);

        for (const match of matches) {
          if (!seen.has(match.id)) {
            seen.add(match.id);
            results.push(match);
          }
        }
      }

      // Score based on keyword frequency
      return this.scoreByKeywordFrequency(results, keywords);
    } catch (error: any) {
      this.logger.error(`Keyword search failed: ${error.message}`);
      return [];
    }
  }

  private async graphSearch(
    query: string,
    context: SearchContext
  ): Promise<SearchResult[]> {
    try {
      // Find seed nodes based on query
      const seedNodes = await this.findSeedNodes(query);

      if (seedNodes.length === 0) {
        return [];
      }

      // Expand through graph relationships
      const results: SearchResult[] = [];

      for (const seed of seedNodes) {
        const related = await this.graph.findRelated(seed.id, 2);

        for (const node of related) {
          results.push({
            id: node.id,
            content: node.content,
            file: node.file,
            score: this.calculateGraphScore(seed, node),
            type: "graph",
            metadata: node.metadata,
          });
        }
      }

      return results;
    } catch (error: any) {
      this.logger.error(`Graph search failed: ${error.message}`);
      return [];
    }
  }

  private fuseResults(
    ...resultSets: SearchResult[][]
  ): SearchResult[] {
    // Reciprocal Rank Fusion
    const scores = new Map<string, number>();
    const resultMap = new Map<string, SearchResult>();

    for (const results of resultSets) {
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const rank = i + 1;
        const score = 1 / (rank + 60); // RRF constant

        scores.set(result.id, (scores.get(result.id) || 0) + score);
        resultMap.set(result.id, result);
      }
    }

    // Sort by fused score
    const fusedResults = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, score]) => {
        const result = resultMap.get(id)!;
        return { ...result, score };
      });

    return fusedResults;
  }

  private async contextualRerank(
    candidates: any[],
    context: SearchContext
  ): Promise<any[]> {
    // Apply context-specific filtering and reranking
    let filtered = candidates;

    // Filter by file types if specified
    if (context.fileTypes && context.fileTypes.length > 0) {
      filtered = filtered.filter((c) =>
        context.fileTypes!.some((type) => c.file.endsWith(type))
      );
    }

    // Filter out excluded paths
    if (context.excludePaths && context.excludePaths.length > 0) {
      filtered = filtered.filter(
        (c) => !context.excludePaths!.some((path) => c.file.includes(path))
      );
    }

    // Boost scores based on context
    return filtered.map((c) => ({
      ...c,
      similarity: this.applyContextBoost(c, context),
    }));
  }

  private applyContextBoost(candidate: any, context: SearchContext): number {
    let boost = candidate.similarity || 0;

    // Boost if in same directory
    if (candidate.file.startsWith(context.workingDir)) {
      boost *= 1.2;
    }

    // Boost based on file type preferences
    if (candidate.file.endsWith(".ts") || candidate.file.endsWith(".tsx")) {
      boost *= 1.1;
    }

    return Math.min(1, boost);
  }

  private extractKeywords(query: string): string[] {
    // Simple keyword extraction
    const words = query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2);

    // Remove common stop words
    const stopWords = new Set([
      "the",
      "is",
      "at",
      "which",
      "on",
      "and",
      "a",
      "an",
      "as",
      "are",
      "was",
      "were",
      "be",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "should",
      "could",
      "may",
      "might",
      "must",
      "can",
      "shall",
    ]);

    return words.filter((w) => !stopWords.has(w));
  }

  private async searchByKeyword(
    keyword: string,
    context: SearchContext
  ): Promise<SearchResult[]> {
    // This would integrate with a proper text search engine
    // For now, returning placeholder results
    return [];
  }

  private scoreByKeywordFrequency(
    results: SearchResult[],
    keywords: string[]
  ): SearchResult[] {
    return results.map((result) => {
      let score = 0;
      const content = result.content.toLowerCase();

      for (const keyword of keywords) {
        const count = (content.match(new RegExp(keyword, "g")) || []).length;
        score += count;
      }

      return { ...result, score: score / keywords.length };
    });
  }

  private async findSeedNodes(query: string): Promise<any[]> {
    // Find initial nodes based on query
    const queryEmbedding = await this.embeddings.embed(query);
    return await this.graph.searchByEmbedding(queryEmbedding, 5);
  }

  private calculateGraphScore(seed: any, node: any): number {
    // Calculate score based on graph distance and relationship strength
    const baseScore = seed.similarity || 0.5;
    const distancePenalty = 0.8; // Reduce score by 20% per hop

    // This is simplified - would need actual distance calculation
    return baseScore * distancePenalty;
  }

  async expandQuery(query: string): Promise<string[]> {
    const expanded = [query];

    // Add synonyms
    const synonymMap: Record<string, string[]> = {
      function: ["method", "procedure", "routine", "func"],
      class: ["type", "struct", "interface", "object"],
      variable: ["var", "const", "let", "field", "property"],
      import: ["require", "include", "use", "from"],
      export: ["expose", "public", "module.exports"],
      async: ["asynchronous", "promise", "await"],
      error: ["exception", "throw", "catch", "err"],
      test: ["spec", "unit", "integration", "suite"],
    };

    const words = query.toLowerCase().split(/\W+/);
    for (const word of words) {
      if (synonymMap[word]) {
        for (const synonym of synonymMap[word]) {
          expanded.push(query.replace(new RegExp(word, "gi"), synonym));
        }
      }
    }

    return expanded;
  }

  async findSimilar(
    content: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    try {
      const embedding = await this.embeddings.embed(content);
      const similar = await this.graph.searchByEmbedding(embedding, limit);

      return similar.map((s) => ({
        id: s.id,
        content: s.content || "",
        file: s.file,
        score: s.similarity || 0,
        type: "similar",
        metadata: s.metadata,
      }));
    } catch (error: any) {
      this.logger.error(`Find similar failed: ${error.message}`);
      return [];
    }
  }
}