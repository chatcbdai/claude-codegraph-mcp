import { pipeline } from "@xenova/transformers";
import crypto from "crypto";

export class EmbeddingEngine {
  private model?: any; // Using any for the pipeline type
  private cache: Map<string, Float32Array> = new Map();
  private initialized = false;
  private modelName = "Xenova/all-MiniLM-L6-v2";

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.error("[CodeGraph] Initializing embedding model...");
      this.model = await pipeline("feature-extraction", this.modelName);
      this.initialized = true;
      console.error("[CodeGraph] Embedding model initialized successfully");
    } catch (error: any) {
      console.error(`[CodeGraph] Warning: Could not initialize embedding model: ${error.message}`);
      console.error("[CodeGraph] Semantic search will use fallback text matching");
      this.initialized = true;
    }
  }

  async embed(text: string): Promise<Float32Array> {
    const cacheKey = this.hashText(text);
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    if (!this.model) {
      return this.fallbackEmbed(text);
    }

    try {
      const truncatedText = text.substring(0, 512);
      
      const output = await this.model(truncatedText, {
        pooling: "mean",
        normalize: true,
      });

      const embedding = new Float32Array(output.data);
      this.cache.set(cacheKey, embedding);

      if (this.cache.size > 10000) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }

      return embedding;
    } catch (error: any) {
      console.error(`[CodeGraph] Error generating embedding: ${error.message}`);
      return this.fallbackEmbed(text);
    }
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const embeddings: Float32Array[] = [];
    
    for (const text of texts) {
      const embedding = await this.embed(text);
      embeddings.push(embedding);
    }
    
    return embeddings;
  }

  cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  private hashText(text: string): string {
    return crypto.createHash("sha256").update(text).digest("hex");
  }

  private fallbackEmbed(text: string): Float32Array {
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 0);
    const uniqueWords = Array.from(new Set(words));
    const embedding = new Float32Array(384);
    
    for (let i = 0; i < uniqueWords.length && i < 384; i++) {
      const word = uniqueWords[i];
      let hash = 0;
      for (let j = 0; j < word.length; j++) {
        hash = ((hash << 5) - hash) + word.charCodeAt(j);
        hash = hash & hash;
      }
      embedding[i % 384] += (hash % 100) / 100;
    }
    
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }
    
    return embedding;
  }

  async search(
    query: string,
    candidates: Array<{ id: string; content: string }>,
    topK: number = 10
  ): Promise<Array<{ id: string; content: string; score: number }>> {
    const queryEmbedding = await this.embed(query);
    const results: Array<{ id: string; content: string; score: number }> = [];

    for (const candidate of candidates) {
      const candidateEmbedding = await this.embed(candidate.content);
      const score = this.cosineSimilarity(queryEmbedding, candidateEmbedding);
      results.push({
        id: candidate.id,
        content: candidate.content,
        score,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}