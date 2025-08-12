import { EmbeddingEngine } from "../src/core/embeddings-fixed";

describe("Fixed Embedding System Validation", () => {
  let engine: EmbeddingEngine;

  beforeAll(async () => {
    engine = new EmbeddingEngine();
    await engine.initialize();
  });

  test("should initialize without errors", () => {
    expect(engine).toBeDefined();
    expect(engine.getActiveProvider()).toBeTruthy();
    console.log(`Active provider: ${engine.getActiveProvider()}`);
  });

  test("should generate valid embeddings", async () => {
    const text = "function testFunction() { return 42; }";
    const embedding = await engine.embed(text);
    
    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(384);
    
    // Check that it's not all zeros
    const sum = Array.from(embedding).reduce((a, b) => a + Math.abs(b), 0);
    expect(sum).toBeGreaterThan(0);
    
    // Check normalization (should be close to 1)
    const norm = Math.sqrt(Array.from(embedding).reduce((a, b) => a + b * b, 0));
    expect(norm).toBeCloseTo(1.0, 1);
  });

  test("should calculate similarity correctly", async () => {
    const text1 = "function add(a, b) { return a + b; }";
    const text2 = "function sum(x, y) { return x + y; }";
    const text3 = "class DatabaseConnection { }";
    
    const emb1 = await engine.embed(text1);
    const emb2 = await engine.embed(text2);
    const emb3 = await engine.embed(text3);
    
    const sim12 = engine.cosineSimilarity(emb1, emb2);
    const sim13 = engine.cosineSimilarity(emb1, emb3);
    
    // Similar functions should have higher similarity than different concepts
    expect(sim12).toBeGreaterThan(sim13);
    expect(sim12).toBeGreaterThan(0.5);
    expect(sim13).toBeLessThan(0.5);
  });

  test("should handle batch embeddings", async () => {
    const texts = [
      "const x = 1;",
      "let y = 2;",
      "var z = 3;"
    ];
    
    const embeddings = await engine.embedBatch(texts);
    
    expect(embeddings).toHaveLength(3);
    embeddings.forEach(emb => {
      expect(emb).toBeInstanceOf(Float32Array);
      expect(emb.length).toBe(384);
    });
  });

  test("should search effectively", async () => {
    const candidates = [
      { id: "1", content: "function calculateTax(amount) { return amount * 0.2; }" },
      { id: "2", content: "class TaxCalculator { compute() { } }" },
      { id: "3", content: "const TAX_RATE = 0.2;" },
      { id: "4", content: "import fs from 'fs';" }
    ];
    
    const results = await engine.search("tax calculation", candidates, 3);
    
    expect(results).toHaveLength(3);
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[0].id).toMatch(/[123]/); // Tax-related should rank higher
    expect(results[2].score).toBeLessThan(results[0].score);
  });
});