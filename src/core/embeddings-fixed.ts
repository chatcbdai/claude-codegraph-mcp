import { pipeline, env } from "@xenova/transformers";
import crypto from "crypto";

// Disable local model loading to ensure compatibility
env.allowLocalModels = false;
// @ts-ignore - remoteURL might not be in types but exists in runtime
env.remoteURL = "https://huggingface.co/";

export interface EmbeddingProvider {
  name: string;
  initialize(): Promise<void>;
  embed(text: string): Promise<Float32Array>;
  isAvailable(): boolean;
}

// Primary: OpenAI-compatible embeddings (requires API key)
class OpenAIProvider implements EmbeddingProvider {
  name = "openai";
  private apiKey?: string;
  private available = false;

  async initialize(): Promise<void> {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.available = !!this.apiKey;
    if (!this.available) {
      console.error("[CodeGraph] OpenAI API key not found, skipping OpenAI provider");
    }
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.available || !this.apiKey) {
      throw new Error("OpenAI provider not available");
    }
    
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: text.substring(0, 8191), // OpenAI limit
        model: "text-embedding-3-small",
        dimensions: 384 // Match our expected dimension
      })
    });
    
    const data: any = await response.json();
    return new Float32Array(data.data[0].embedding);
  }

  isAvailable(): boolean {
    return this.available;
  }
}

// Secondary: Fixed Xenova Transformers
class XenovaProvider implements EmbeddingProvider {
  name = "xenova";
  private model?: any;
  private available = false;

  async initialize(): Promise<void> {
    try {
      // Use a more stable model
      this.model = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
        quantized: false, // Disable quantization to avoid type issues
      });
      
      // Test the model with a simple embedding
      const testOutput = await this.model("test", { pooling: "mean", normalize: true });
      
      // Verify output format
      if (testOutput && testOutput.data) {
        this.available = true;
        console.error("[CodeGraph] Xenova provider initialized successfully");
      } else {
        throw new Error("Invalid model output format");
      }
    } catch (error: any) {
      console.error(`[CodeGraph] Xenova provider failed: ${error.message}`);
      this.available = false;
    }
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.available || !this.model) {
      throw new Error("Xenova provider not available");
    }
    
    try {
      const output = await this.model(text.substring(0, 512), {
        pooling: "mean",
        normalize: true,
      });
      
      // Handle both possible output formats
      let data: number[];
      if (output.data) {
        data = Array.from(output.data);
      } else if (output.ort_tensor?.data) {
        data = Array.from(output.ort_tensor.data);
      } else if (Array.isArray(output)) {
        data = output;
      } else {
        throw new Error("Unexpected output format from model");
      }
      
      return new Float32Array(data);
    } catch (error: any) {
      throw new Error(`Xenova embedding failed: ${error.message}`);
    }
  }

  isAvailable(): boolean {
    return this.available;
  }
}

// Tertiary: Deterministic fallback (always works)
class DeterministicProvider implements EmbeddingProvider {
  name = "deterministic";
  private available = true;
  private dimensions = 384;

  async initialize(): Promise<void> {
    console.error("[CodeGraph] Deterministic embedding provider ready (fallback)");
  }

  async embed(text: string): Promise<Float32Array> {
    // Create a deterministic embedding based on text content
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 0);
    const embedding = new Float32Array(this.dimensions);
    
    // Use multiple hash functions for better distribution
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // Multiple hash strategies
      const hash1 = this.hashCode(word);
      const hash2 = this.hashCode(word.split('').reverse().join(''));
      const hash3 = this.hashCode(word + word);
      
      // Distribute across embedding dimensions
      embedding[(hash1 >>> 0) % this.dimensions] += 1.0 / (i + 1);
      embedding[(hash2 >>> 0) % this.dimensions] += 0.5 / (i + 1);
      embedding[(hash3 >>> 0) % this.dimensions] += 0.25 / (i + 1);
    }
    
    // Add positional encoding
    for (let i = 0; i < Math.min(words.length, this.dimensions); i++) {
      embedding[i] += Math.sin(i / 10.0) * 0.1;
    }
    
    // Normalize
    let norm = 0;
    for (let i = 0; i < embedding.length; i++) {
      norm += embedding[i] * embedding[i];
    }
    norm = Math.sqrt(norm);
    
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }
    
    return embedding;
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  isAvailable(): boolean {
    return this.available;
  }
}

export class EmbeddingEngine {
  private providers: EmbeddingProvider[] = [];
  private activeProvider?: EmbeddingProvider;
  private cache: Map<string, Float32Array> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.error("[CodeGraph] Initializing embedding system with multiple providers...");
    
    // Initialize all providers in order of preference
    const providerClasses = [
      OpenAIProvider,
      XenovaProvider,
      DeterministicProvider
    ];
    
    for (const ProviderClass of providerClasses) {
      const provider = new ProviderClass();
      await provider.initialize();
      this.providers.push(provider);
      
      // Use the first available provider
      if (!this.activeProvider && provider.isAvailable()) {
        this.activeProvider = provider;
        console.error(`[CodeGraph] Using ${provider.name} embedding provider`);
      }
    }
    
    if (!this.activeProvider) {
      // This should never happen as DeterministicProvider always works
      throw new Error("No embedding providers available!");
    }
    
    this.initialized = true;
    console.error("[CodeGraph] Embedding system initialized successfully");
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.initialized || !this.activeProvider) {
      throw new Error("Embedding engine not initialized");
    }

    const cacheKey = this.hashText(text);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    let lastError: Error | null = null;
    
    // Try active provider first
    try {
      const embedding = await this.activeProvider.embed(text);
      this.cache.set(cacheKey, embedding);
      return embedding;
    } catch (error: any) {
      lastError = error;
      console.error(`[CodeGraph] Primary provider ${this.activeProvider.name} failed: ${error.message}`);
    }
    
    // Fallback through remaining providers
    for (const provider of this.providers) {
      if (provider === this.activeProvider || !provider.isAvailable()) continue;
      
      try {
        console.error(`[CodeGraph] Falling back to ${provider.name} provider`);
        const embedding = await provider.embed(text);
        
        // Switch to this provider for future embeddings
        this.activeProvider = provider;
        
        this.cache.set(cacheKey, embedding);
        return embedding;
      } catch (error: any) {
        lastError = error;
        console.error(`[CodeGraph] Provider ${provider.name} failed: ${error.message}`);
      }
    }
    
    throw new Error(`All embedding providers failed. Last error: ${lastError?.message}`);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const embeddings: Float32Array[] = [];
    for (const text of texts) {
      embeddings.push(await this.embed(text));
    }
    return embeddings;
  }

  cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      console.warn(`[CodeGraph] Embedding dimension mismatch: ${a.length} vs ${b.length}`);
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

  getActiveProvider(): string {
    return this.activeProvider?.name || "none";
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