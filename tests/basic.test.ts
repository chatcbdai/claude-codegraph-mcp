import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { CodeGraphCore } from "../src/core/indexer";
import { AutoIndexer } from "../src/core/auto-indexer";
import { CodeParser } from "../src/core/parser";
import { SmartChunker } from "../src/utils/chunker";
import { CodeGraph } from "../src/core/graph";
import { EmbeddingEngine } from "../src/core/embeddings";
import path from "path";
import fs from "fs/promises";

describe("CodeGraph Core Tests", () => {
  let core: CodeGraphCore;
  let autoIndexer: AutoIndexer;
  let testDir: string;

  beforeAll(async () => {
    core = new CodeGraphCore();
    autoIndexer = new AutoIndexer(core);
    testDir = path.join(__dirname, "test-project");
    
    await fs.mkdir(testDir, { recursive: true });
    await core.initialize();
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("Parser Tests", () => {
    it("should parse JavaScript code", async () => {
      const parser = new CodeParser();
      await parser.initialize();
      
      const code = `
        function hello(name) {
          return "Hello, " + name;
        }
        
        class Greeter {
          greet(name) {
            return hello(name);
          }
        }
      `;
      
      const parsed = await parser.parseFile(code, "javascript");
      
      expect(parsed.functions).toHaveLength(1);
      expect(parsed.functions[0].name).toBe("hello");
      expect(parsed.classes).toHaveLength(1);
      expect(parsed.classes[0].name).toBe("Greeter");
    });

    it("should parse Python code", async () => {
      const parser = new CodeParser();
      await parser.initialize();
      
      const code = `
def calculate(x, y):
    return x + y

class Calculator:
    def add(self, a, b):
        return calculate(a, b)
      `;
      
      const parsed = await parser.parseFile(code, "python");
      
      expect(parsed.functions).toHaveLength(1);
      expect(parsed.functions[0].name).toBe("calculate");
      expect(parsed.classes).toHaveLength(1);
      expect(parsed.classes[0].name).toBe("Calculator");
    });
  });

  describe("Chunker Tests", () => {
    it("should chunk code intelligently", () => {
      const chunker = new SmartChunker(500, 50);
      
      const parsedFile = {
        path: "/test/file.js",
        language: "javascript",
        functions: [
          {
            name: "testFunc",
            startLine: 1,
            endLine: 10,
            content: "function testFunc() { return 42; }",
            async: false,
            params: [],
            calls: [],
            references: [],
          },
        ],
        classes: [],
        imports: [],
        exports: [],
        dependencies: [],
      };
      
      const content = "function testFunc() { return 42; }";
      const chunks = chunker.chunkCode(parsedFile, content);
      
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe("function");
      expect(chunks[0].metadata.name).toBe("testFunc");
    });
  });

  describe("Graph Database Tests", () => {
    it("should initialize SQLite database", async () => {
      const graph = new CodeGraph({ type: "sqlite", path: ":memory:" });
      await graph.initialize();
      
      const node = {
        id: "test-node",
        type: "function",
        name: "testFunction",
        file: "/test/file.js",
        content: "function test() {}",
        metadata: { test: true },
      };
      
      await graph.addNode(node);
      const related = await graph.findRelated("test-node", 1);
      
      expect(related).toBeDefined();
    });

    it("should add and query relationships", async () => {
      const graph = new CodeGraph({ type: "sqlite", path: ":memory:" });
      await graph.initialize();
      
      await graph.addNode({
        id: "node1",
        type: "function",
        name: "func1",
        file: "/test/file1.js",
        content: "",
        metadata: {},
      });
      
      await graph.addNode({
        id: "node2",
        type: "function",
        name: "func2",
        file: "/test/file2.js",
        content: "",
        metadata: {},
      });
      
      await graph.addRelationship("node1", "node2", "CALLS");
      
      const related = await graph.findRelated("node1", 2);
      expect(related.length).toBeGreaterThan(0);
    });
  });

  describe("Embedding Engine Tests", () => {
    it("should generate embeddings", async () => {
      const engine = new EmbeddingEngine();
      await engine.initialize();
      
      const text = "function calculateSum(a, b) { return a + b; }";
      const embedding = await engine.embed(text);
      
      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
    });

    it("should calculate similarity", async () => {
      const engine = new EmbeddingEngine();
      await engine.initialize();
      
      const text1 = "function add(a, b) { return a + b; }";
      const text2 = "function sum(x, y) { return x + y; }";
      const text3 = "class Car { drive() {} }";
      
      const emb1 = await engine.embed(text1);
      const emb2 = await engine.embed(text2);
      const emb3 = await engine.embed(text3);
      
      const similarity12 = engine.cosineSimilarity(emb1, emb2);
      const similarity13 = engine.cosineSimilarity(emb1, emb3);
      
      expect(similarity12).toBeGreaterThan(similarity13);
    });
  });

  describe("Auto-Indexer Tests", () => {
    it("should track indexing status", async () => {
      const status = autoIndexer.getStatus(testDir);
      
      if (status) {
        expect(status).toHaveProperty("isIndexing");
        expect(status).toHaveProperty("progress");
        expect(status).toHaveProperty("capabilities");
      }
    });

    it("should report capabilities", () => {
      const capabilities = autoIndexer.getCapabilities(testDir);
      
      expect(capabilities).toHaveProperty("syntaxAnalysis");
      expect(capabilities).toHaveProperty("graphRelationships");
      expect(capabilities).toHaveProperty("semanticSearch");
      expect(capabilities).toHaveProperty("temporalAnalysis");
      expect(capabilities).toHaveProperty("queryIntelligence");
    });
  });
});

describe("Integration Tests", () => {
  it("should handle a complete indexing workflow", async () => {
    const testProjectDir = path.join(__dirname, "sample-project");
    
    await fs.mkdir(testProjectDir, { recursive: true });
    
    await fs.writeFile(
      path.join(testProjectDir, "index.js"),
      `
const utils = require('./utils');

function main() {
  console.log(utils.greet('World'));
}

main();
      `
    );
    
    await fs.writeFile(
      path.join(testProjectDir, "utils.js"),
      `
function greet(name) {
  return "Hello, " + name;
}

module.exports = { greet };
      `
    );
    
    const core = new CodeGraphCore();
    const autoIndexer = new AutoIndexer(core);
    
    await core.initialize();
    
    const needsIndexing = await autoIndexer["needsIndexing"](testProjectDir);
    expect(needsIndexing).toBe(true);
    
    await fs.rm(testProjectDir, { recursive: true, force: true });
  });
});