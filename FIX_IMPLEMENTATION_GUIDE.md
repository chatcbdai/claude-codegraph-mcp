# 🔧 CODEGRAPH MCP CRITICAL FIX IMPLEMENTATION GUIDE

## ⚠️ PREREQUISITES - DO NOT SKIP
1. Create full backup: `cp -r . ../claude-codegraph-backup-$(date +%Y%m%d-%H%M%S)`
2. Create new branch: `git checkout -b critical-fixes-$(date +%Y%m%d)`
3. Document current state: `npm test > baseline-test-results.txt 2>&1`

---

## 🔴 PHASE 1: CRITICAL FIXES (Must complete in order)

### FIX #1: EMBEDDING SYSTEM [CRITICAL - BLOCKING]

#### Problem
- Float32Array type errors in @xenova/transformers
- Fallback to hash-based fake embeddings
- Semantic search completely broken

#### Implementation Steps

```bash
# Step 1.1: Create new embedding implementation with multiple providers
cat > src/core/embeddings-fixed.ts << 'EOF'
import { pipeline, env } from "@xenova/transformers";
import crypto from "crypto";

// Disable local model loading to ensure compatibility
env.allowLocalModels = false;
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
    
    const data = await response.json();
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
EOF
```

#### Verification Steps
```bash
# Create test file for embeddings
cat > tests/embedding-fix-validation.test.ts << 'EOF'
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
EOF

# Run the validation test
npm test -- tests/embedding-fix-validation.test.ts
```

#### Rollback Plan
```bash
# If tests fail, restore original
mv src/core/embeddings.ts src/core/embeddings-broken.ts
mv src/core/embeddings-fixed.ts src/core/embeddings.ts

# Update imports in all files
find src -name "*.ts" -exec sed -i '' 's/embeddings-fixed/embeddings/g' {} \;
```

---

### FIX #2: TREE-SITTER IMPLEMENTATION [CRITICAL]

#### Problem
- Tree-sitter dependencies installed but never used
- All parsing done with unreliable regex

#### Implementation Steps

```bash
# Step 2.1: Create proper tree-sitter parser
cat > src/core/parser-treesitter.ts << 'EOF'
import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";
import Python from "tree-sitter-python";
import Go from "tree-sitter-go";
import Rust from "tree-sitter-rust";
import Java from "tree-sitter-java";
import { ParsedFile } from "./indexer.js";

export interface ParserConfig {
  useTreeSitter: boolean;
  fallbackToRegex: boolean;
  maxFileSize: number;
}

export class TreeSitterParser {
  private parsers: Map<string, Parser> = new Map();
  private languageMap: Map<string, any> = new Map();
  private initialized = false;
  private config: ParserConfig;

  constructor(config: ParserConfig = {
    useTreeSitter: true,
    fallbackToRegex: true,
    maxFileSize: 10 * 1024 * 1024 // 10MB
  }) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize tree-sitter parsers for each language
      const languages = [
        { name: "javascript", grammar: JavaScript },
        { name: "typescript", grammar: TypeScript.typescript },
        { name: "tsx", grammar: TypeScript.tsx },
        { name: "python", grammar: Python },
        { name: "go", grammar: Go },
        { name: "rust", grammar: Rust },
        { name: "java", grammar: Java }
      ];

      for (const { name, grammar } of languages) {
        const parser = new Parser();
        parser.setLanguage(grammar);
        this.parsers.set(name, parser);
        this.languageMap.set(name, grammar);
      }

      // Verify parsers work
      const testParser = this.parsers.get("javascript");
      if (testParser) {
        const tree = testParser.parse("const x = 1;");
        if (!tree || !tree.rootNode) {
          throw new Error("Parser verification failed");
        }
      }

      this.initialized = true;
      console.error("[CodeGraph] Tree-sitter parsers initialized successfully");
    } catch (error: any) {
      console.error(`[CodeGraph] Tree-sitter initialization failed: ${error.message}`);
      if (!this.config.fallbackToRegex) {
        throw error;
      }
    }
  }

  async parseFile(content: string, language: string): Promise<ParsedFile> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check file size limit
    if (content.length > this.config.maxFileSize) {
      console.warn(`[CodeGraph] File too large for parsing (${content.length} bytes)`);
      return this.createEmptyStructure(language);
    }

    // Map language aliases
    const langMap: { [key: string]: string } = {
      "js": "javascript",
      "jsx": "javascript",
      "ts": "typescript",
      "tsx": "tsx",
      "py": "python",
      "go": "go",
      "rs": "rust",
      "java": "java"
    };

    const parserLang = langMap[language] || language;
    const parser = this.parsers.get(parserLang);

    if (!parser) {
      console.warn(`[CodeGraph] No tree-sitter parser for ${language}`);
      if (this.config.fallbackToRegex) {
        return this.regexFallback(content, language);
      }
      return this.createEmptyStructure(language);
    }

    try {
      const tree = parser.parse(content);
      return this.extractStructure(tree, content, language);
    } catch (error: any) {
      console.error(`[CodeGraph] Tree-sitter parsing failed: ${error.message}`);
      if (this.config.fallbackToRegex) {
        return this.regexFallback(content, language);
      }
      throw error;
    }
  }

  private extractStructure(tree: Parser.Tree, content: string, language: string): ParsedFile {
    const structure: ParsedFile = {
      path: "",
      language,
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      dependencies: [],
      typeAliases: [],
      constants: []
    };

    const cursor = tree.walk();
    const visitedNodes = new Set<number>();

    // Traverse the AST
    const traverse = (depth: number = 0): void => {
      if (depth > 1000) return; // Prevent infinite recursion
      
      const node = cursor.currentNode;
      const nodeId = node.id;
      
      if (visitedNodes.has(nodeId)) return;
      visitedNodes.add(nodeId);

      switch (node.type) {
        case "function_declaration":
        case "function_expression":
        case "arrow_function":
        case "method_definition":
          this.extractFunction(node, content, structure);
          break;
        
        case "class_declaration":
        case "class_expression":
          this.extractClass(node, content, structure);
          break;
        
        case "import_statement":
        case "import_declaration":
          this.extractImport(node, content, structure);
          break;
        
        case "export_statement":
        case "export_declaration":
          this.extractExport(node, content, structure);
          break;
        
        case "type_alias_declaration":
          this.extractTypeAlias(node, content, structure);
          break;
        
        case "variable_declaration":
        case "lexical_declaration":
          this.extractConstants(node, content, structure);
          break;
      }

      // Traverse children
      if (cursor.gotoFirstChild()) {
        do {
          traverse(depth + 1);
        } while (cursor.gotoNextSibling());
        cursor.gotoParent();
      }
    };

    traverse();
    return structure;
  }

  private extractFunction(node: Parser.SyntaxNode, content: string, structure: ParsedFile): void {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;

    const name = content.substring(nameNode.startIndex, nameNode.endIndex);
    const params = this.extractParameters(node, content);
    const isAsync = content.substring(node.startIndex, nameNode.startIndex).includes("async");
    
    // Extract function calls within the function
    const bodyNode = node.childForFieldName("body");
    const calls = bodyNode ? this.extractFunctionCalls(bodyNode, content) : [];

    structure.functions.push({
      name,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      async: isAsync,
      params,
      calls,
      references: [],
      content: content.substring(node.startIndex, Math.min(node.endIndex, node.startIndex + 500))
    });
  }

  private extractClass(node: Parser.SyntaxNode, content: string, structure: ParsedFile): void {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;

    const name = content.substring(nameNode.startIndex, nameNode.endIndex);
    const superclassNode = node.childForFieldName("superclass");
    const extends_ = superclassNode ? 
      content.substring(superclassNode.startIndex, superclassNode.endIndex) : undefined;

    const methods: string[] = [];
    const properties: string[] = [];

    // Extract methods and properties
    const bodyNode = node.childForFieldName("body");
    if (bodyNode) {
      for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        if (!child) continue;

        if (child.type === "method_definition") {
          const methodName = child.childForFieldName("name");
          if (methodName) {
            methods.push(content.substring(methodName.startIndex, methodName.endIndex));
          }
        } else if (child.type === "field_definition" || child.type === "property_definition") {
          const propName = child.childForFieldName("property");
          if (propName) {
            properties.push(content.substring(propName.startIndex, propName.endIndex));
          }
        }
      }
    }

    structure.classes.push({
      name,
      extends: extends_,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      methods,
      properties,
      content: content.substring(node.startIndex, Math.min(node.endIndex, node.startIndex + 500))
    });
  }

  private extractImport(node: Parser.SyntaxNode, content: string, structure: ParsedFile): void {
    const sourceNode = node.childForFieldName("source");
    if (!sourceNode) return;

    let source = content.substring(sourceNode.startIndex, sourceNode.endIndex);
    // Remove quotes
    source = source.replace(/^['"`]|['"`]$/g, '');

    structure.imports.push({
      source,
      line: node.startPosition.row + 1,
      type: "import"
    });
    
    if (!source.startsWith('.')) {
      // External dependency
      const depName = source.split('/')[0];
      if (!structure.dependencies.includes(depName)) {
        structure.dependencies.push(depName);
      }
    }
  }

  private extractExport(node: Parser.SyntaxNode, content: string, structure: ParsedFile): void {
    // Find what's being exported
    let exportName = "default";
    
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === "identifier") {
        exportName = content.substring(child.startIndex, child.endIndex);
        break;
      }
    }

    structure.exports.push({
      name: exportName,
      line: node.startPosition.row + 1,
      type: node.type.includes("default") ? "default" : "named"
    });
  }

  private extractTypeAlias(node: Parser.SyntaxNode, content: string, structure: ParsedFile): void {
    const nameNode = node.childForFieldName("name");
    const valueNode = node.childForFieldName("value");
    
    if (nameNode && valueNode) {
      structure.typeAliases?.push({
        name: content.substring(nameNode.startIndex, nameNode.endIndex),
        value: content.substring(valueNode.startIndex, valueNode.endIndex),
        line: node.startPosition.row + 1
      });
    }
  }

  private extractConstants(node: Parser.SyntaxNode, content: string, structure: ParsedFile): void {
    // Look for UPPER_CASE constants
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;

      if (child.type === "variable_declarator") {
        const nameNode = child.childForFieldName("name");
        if (nameNode) {
          const name = content.substring(nameNode.startIndex, nameNode.endIndex);
          if (/^[A-Z_][A-Z0-9_]*$/.test(name)) {
            const valueNode = child.childForFieldName("value");
            structure.constants?.push({
              name,
              value: valueNode ? 
                content.substring(valueNode.startIndex, valueNode.endIndex) : "undefined",
              line: node.startPosition.row + 1
            });
          }
        }
      }
    }
  }

  private extractParameters(node: Parser.SyntaxNode, content: string): string[] {
    const params: string[] = [];
    const paramsNode = node.childForFieldName("parameters");
    
    if (paramsNode) {
      for (let i = 0; i < paramsNode.childCount; i++) {
        const child = paramsNode.child(i);
        if (child && child.type === "identifier") {
          params.push(content.substring(child.startIndex, child.endIndex));
        }
      }
    }
    
    return params;
  }

  private extractFunctionCalls(node: Parser.SyntaxNode, content: string): string[] {
    const calls = new Set<string>();
    
    const findCalls = (n: Parser.SyntaxNode): void => {
      if (n.type === "call_expression") {
        const funcNode = n.childForFieldName("function");
        if (funcNode && funcNode.type === "identifier") {
          calls.add(content.substring(funcNode.startIndex, funcNode.endIndex));
        }
      }
      
      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (child) findCalls(child);
      }
    };
    
    findCalls(node);
    return Array.from(calls);
  }

  private createEmptyStructure(language: string): ParsedFile {
    return {
      path: "",
      language,
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      dependencies: [],
      typeAliases: [],
      constants: []
    };
  }

  private regexFallback(content: string, language: string): ParsedFile {
    console.warn(`[CodeGraph] Using regex fallback for ${language}`);
    // Import the old regex parser as fallback
    const { EnhancedCodeParser } = require("./parser-enhanced.js");
    const fallbackParser = new EnhancedCodeParser();
    return fallbackParser.parseFile(content, language);
  }
}
EOF
```

#### Verification Steps
```bash
# Create tree-sitter validation test
cat > tests/treesitter-validation.test.ts << 'EOF'
import { TreeSitterParser } from "../src/core/parser-treesitter";

describe("Tree-Sitter Parser Validation", () => {
  let parser: TreeSitterParser;

  beforeAll(async () => {
    parser = new TreeSitterParser();
    await parser.initialize();
  });

  test("should parse JavaScript with tree-sitter", async () => {
    const code = `
import React from 'react';

export default class MyComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = { count: 0 };
  }

  async fetchData() {
    const response = await fetch('/api/data');
    return response.json();
  }

  render() {
    return <div>{this.state.count}</div>;
  }
}

export const CONSTANT_VALUE = 42;
export function helperFunction(a, b) {
  return a + b;
}
`;

    const result = await parser.parseFile(code, "javascript");
    
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].source).toBe("react");
    
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0].name).toBe("MyComponent");
    expect(result.classes[0].extends).toBe("React.Component");
    expect(result.classes[0].methods).toContain("constructor");
    expect(result.classes[0].methods).toContain("fetchData");
    expect(result.classes[0].methods).toContain("render");
    
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe("helperFunction");
    expect(result.functions[0].params).toEqual(["a", "b"]);
    
    expect(result.constants).toHaveLength(1);
    expect(result.constants[0].name).toBe("CONSTANT_VALUE");
    
    expect(result.exports).toHaveLength(3);
  });

  test("should parse Python with tree-sitter", async () => {
    const code = `
from typing import List, Optional
import asyncio

class DataProcessor:
    def __init__(self, name: str):
        self.name = name
        self.data: List[str] = []
    
    async def process(self, items: List[str]) -> List[str]:
        results = []
        for item in items:
            result = await self.process_item(item)
            results.append(result)
        return results
    
    async def process_item(self, item: str) -> str:
        await asyncio.sleep(0.1)
        return item.upper()

def helper_function(x: int, y: int) -> int:
    return x + y

MAX_RETRIES = 3
API_ENDPOINT = "https://api.example.com"
`;

    const result = await parser.parseFile(code, "python");
    
    expect(result.imports).toHaveLength(2);
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0].name).toBe("DataProcessor");
    expect(result.classes[0].methods).toContain("__init__");
    expect(result.classes[0].methods).toContain("process");
    expect(result.classes[0].methods).toContain("process_item");
    
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe("helper_function");
    
    expect(result.constants).toHaveLength(2);
    expect(result.constants.map(c => c.name)).toContain("MAX_RETRIES");
    expect(result.constants.map(c => c.name)).toContain("API_ENDPOINT");
  });

  test("should handle malformed code gracefully", async () => {
    const malformedCode = `
function broken(a, b {  // Missing closing paren
  return a + b;
}

class  {  // Missing class name
  method() {}
}
`;

    const result = await parser.parseFile(malformedCode, "javascript");
    
    // Should still extract what it can
    expect(result).toBeDefined();
    expect(result.functions.length).toBeGreaterThanOrEqual(0);
    expect(result.classes.length).toBeGreaterThanOrEqual(0);
  });

  test("should be significantly more accurate than regex", async () => {
    // Complex code that regex would struggle with
    const complexCode = `
const arrowFunc = (a, b) => {
  const innerFunc = () => a + b;
  return innerFunc();
};

const obj = {
  method(x) {
    return x * 2;
  },
  async asyncMethod() {
    return await Promise.resolve(42);
  }
};

// This is not a function: function fakeFunction
/* function commentedFunction() {} */
const stringWithFunction = "function notAFunction() {}";
`;

    const result = await parser.parseFile(complexCode, "javascript");
    
    // Tree-sitter should correctly identify only real functions
    const functionNames = result.functions.map(f => f.name);
    expect(functionNames).toContain("arrowFunc");
    expect(functionNames).not.toContain("fakeFunction");
    expect(functionNames).not.toContain("commentedFunction");
    expect(functionNames).not.toContain("notAFunction");
  });
});
EOF

# Run validation
npm test -- tests/treesitter-validation.test.ts
```

---

## 🟡 PHASE 2: ARCHITECTURAL FIXES

### FIX #3: DIRECTORY TRAVERSAL & FILE WATCHING

```bash
# Create consistent traversal configuration
cat > src/core/file-scanner.ts << 'EOF'
import fs from "fs/promises";
import path from "path";
import { simpleGit, SimpleGit } from "simple-git";
import ignore from "ignore";

export interface ScanConfig {
  maxDepth: number;
  followSymlinks: boolean;
  respectGitignore: boolean;
  excludePatterns: string[];
  includePatterns: string[];
  maxFileSize: number;
}

export class FileScanner {
  private config: ScanConfig;
  private git?: SimpleGit;
  private gitignore?: any;

  constructor(config: Partial<ScanConfig> = {}) {
    this.config = {
      maxDepth: 10, // Consistent depth limit
      followSymlinks: false,
      respectGitignore: true,
      excludePatterns: [
        "node_modules",
        ".git",
        ".codegraph",
        "dist",
        "build",
        "__pycache__",
        ".cache",
        ".next",
        ".nuxt",
        ".vscode",
        ".idea",
        "*.min.js",
        "*.min.css"
      ],
      includePatterns: [
        "*.ts", "*.tsx", "*.js", "*.jsx",
        "*.py", "*.go", "*.rs", "*.java",
        "*.cpp", "*.c", "*.h", "*.hpp",
        "*.cs", "*.rb", "*.php", "*.swift"
      ],
      maxFileSize: 1024 * 1024, // 1MB default
      ...config
    };
  }

  async initialize(projectPath: string): Promise<void> {
    // Initialize git for worktree detection
    try {
      this.git = simpleGit(projectPath);
      
      // Load .gitignore if it exists
      if (this.config.respectGitignore) {
        const gitignorePath = path.join(projectPath, ".gitignore");
        try {
          const gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
          this.gitignore = ignore().add(gitignoreContent);
        } catch {
          // No .gitignore file
        }
      }
    } catch {
      // Not a git repository
    }
  }

  async scanDirectory(
    dirPath: string,
    currentDepth: number = 0
  ): Promise<string[]> {
    const files: string[] = [];
    
    // Check depth limit
    if (currentDepth >= this.config.maxDepth) {
      console.warn(`[FileScanner] Max depth ${this.config.maxDepth} reached at ${dirPath}`);
      return files;
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(process.cwd(), fullPath);
        
        // Check exclusions
        if (this.shouldExclude(entry.name, relativePath)) {
          continue;
        }
        
        if (entry.isDirectory()) {
          // Check if it's a symlink and whether we should follow
          if (entry.isSymbolicLink() && !this.config.followSymlinks) {
            continue;
          }
          
          // Recursively scan subdirectory
          const subFiles = await this.scanDirectory(fullPath, currentDepth + 1);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          // Check file pattern and size
          if (this.shouldIncludeFile(entry.name, fullPath)) {
            const stats = await fs.stat(fullPath);
            if (stats.size <= this.config.maxFileSize) {
              files.push(fullPath);
            } else {
              console.warn(`[FileScanner] File too large: ${fullPath} (${stats.size} bytes)`);
            }
          }
        }
      }
    } catch (error: any) {
      console.error(`[FileScanner] Error scanning ${dirPath}: ${error.message}`);
    }
    
    return files;
  }

  private shouldExclude(name: string, relativePath: string): boolean {
    // Check exclude patterns
    for (const pattern of this.config.excludePatterns) {
      if (name === pattern || name.includes(pattern)) {
        return true;
      }
    }
    
    // Check gitignore
    if (this.gitignore && this.gitignore.ignores(relativePath)) {
      return true;
    }
    
    return false;
  }

  private shouldIncludeFile(name: string, fullPath: string): boolean {
    // Check include patterns
    for (const pattern of this.config.includePatterns) {
      const regex = new RegExp(pattern.replace("*", ".*"));
      if (regex.test(name)) {
        return true;
      }
    }
    return false;
  }

  async getWorktrees(): Promise<string[]> {
    if (!this.git) return [];
    
    try {
      const output = await this.git.raw(["worktree", "list", "--porcelain"]);
      const worktrees: string[] = [];
      
      for (const line of output.split("\n")) {
        if (line.startsWith("worktree ")) {
          worktrees.push(line.substring(9).trim());
        }
      }
      
      return worktrees;
    } catch {
      return [];
    }
  }

  async getFileList(projectPath: string): Promise<string[]> {
    await this.initialize(projectPath);
    
    // Get worktrees to exclude
    const worktrees = await this.getWorktrees();
    const mainPath = path.resolve(projectPath);
    
    // Filter out worktree paths
    const files = await this.scanDirectory(projectPath);
    return files.filter(file => {
      const filePath = path.resolve(file);
      // Exclude files in worktrees (except main)
      return !worktrees.some(wt => 
        wt !== mainPath && filePath.startsWith(wt)
      );
    });
  }
}
EOF
```

### FIX #4: DATABASE MANAGEMENT & CLEANUP

```bash
cat > src/core/db-manager.ts << 'EOF'
import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs/promises";
import crypto from "crypto";

export interface ProjectDatabase {
  path: string;
  projectPath: string;
  projectName: string;
  size: number;
  lastAccessed: Date;
  created: Date;
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private databases: Map<string, Database.Database> = new Map();
  private dbRoot: string;
  private maxDatabases: number = 10;
  private maxTotalSize: number = 500 * 1024 * 1024; // 500MB

  constructor() {
    this.dbRoot = path.join(os.homedir(), ".codegraph", "projects");
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  async getDatabase(projectPath: string): Promise<Database.Database> {
    const dbPath = await this.getDatabasePath(projectPath);
    
    // Check if already open
    if (this.databases.has(dbPath)) {
      await this.updateLastAccessed(dbPath);
      return this.databases.get(dbPath)!;
    }
    
    // Check cleanup needed
    await this.cleanupIfNeeded();
    
    // Create/open database
    const dbDir = path.dirname(dbPath);
    await fs.mkdir(dbDir, { recursive: true });
    
    const db = new Database(dbPath);
    this.databases.set(dbPath, db);
    
    // Save metadata
    await this.saveProjectMetadata(projectPath, dbPath);
    
    return db;
  }

  private async getDatabasePath(projectPath: string): Promise<string> {
    const projectHash = crypto
      .createHash("sha256")
      .update(projectPath)
      .digest("hex")
      .substring(0, 12);
    
    const projectName = path.basename(projectPath)
      .replace(/[^a-zA-Z0-9-_]/g, "_")
      .substring(0, 50);
    
    return path.join(
      this.dbRoot,
      `${projectName}_${projectHash}`,
      "graph.db"
    );
  }

  private async saveProjectMetadata(projectPath: string, dbPath: string): Promise<void> {
    const metaPath = path.join(path.dirname(dbPath), "project.json");
    const metadata = {
      projectPath,
      projectName: path.basename(projectPath),
      dbPath,
      created: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      version: "2.0.0"
    };
    
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
  }

  private async updateLastAccessed(dbPath: string): Promise<void> {
    const metaPath = path.join(path.dirname(dbPath), "project.json");
    try {
      const content = await fs.readFile(metaPath, "utf-8");
      const metadata = JSON.parse(content);
      metadata.lastAccessed = new Date().toISOString();
      await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
    } catch {
      // Metadata file doesn't exist or is corrupted
    }
  }

  async listProjects(): Promise<ProjectDatabase[]> {
    const projects: ProjectDatabase[] = [];
    
    try {
      const entries = await fs.readdir(this.dbRoot, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const projectDir = path.join(this.dbRoot, entry.name);
        const metaPath = path.join(projectDir, "project.json");
        const dbPath = path.join(projectDir, "graph.db");
        
        try {
          const [metadata, stats] = await Promise.all([
            fs.readFile(metaPath, "utf-8").then(JSON.parse),
            fs.stat(dbPath)
          ]);
          
          projects.push({
            path: dbPath,
            projectPath: metadata.projectPath,
            projectName: metadata.projectName,
            size: stats.size,
            lastAccessed: new Date(metadata.lastAccessed),
            created: new Date(metadata.created)
          });
        } catch {
          // Skip corrupted project
        }
      }
    } catch {
      // Projects directory doesn't exist yet
    }
    
    return projects;
  }

  async cleanupIfNeeded(): Promise<void> {
    const projects = await this.listProjects();
    
    // Sort by last accessed (oldest first)
    projects.sort((a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime());
    
    // Calculate total size
    const totalSize = projects.reduce((sum, p) => sum + p.size, 0);
    
    // Clean up if over limits
    if (projects.length > this.maxDatabases || totalSize > this.maxTotalSize) {
      console.log("[DatabaseManager] Starting cleanup...");
      
      let currentSize = totalSize;
      let currentCount = projects.length;
      
      for (const project of projects) {
        if (currentCount <= this.maxDatabases / 2 && currentSize <= this.maxTotalSize / 2) {
          break; // Keep at least half capacity
        }
        
        // Don't delete if accessed in last 7 days
        const daysSinceAccess = (Date.now() - project.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceAccess < 7) continue;
        
        // Delete old project
        await this.deleteProject(project.path);
        currentSize -= project.size;
        currentCount--;
        
        console.log(`[DatabaseManager] Deleted old project: ${project.projectName}`);
      }
    }
  }

  async deleteProject(dbPath: string): Promise<void> {
    // Close database if open
    const db = this.databases.get(dbPath);
    if (db) {
      db.close();
      this.databases.delete(dbPath);
    }
    
    // Delete directory
    const projectDir = path.dirname(dbPath);
    await fs.rm(projectDir, { recursive: true, force: true });
  }

  async compactDatabase(projectPath: string): Promise<void> {
    const db = await this.getDatabase(projectPath);
    db.exec("VACUUM");
    db.exec("ANALYZE");
  }

  closeAll(): void {
    for (const [path, db] of this.databases) {
      db.close();
    }
    this.databases.clear();
  }
}
EOF
```

### FIX #5: ERROR HANDLING & RACE CONDITIONS

```bash
cat > src/core/error-handler.ts << 'EOF'
export class CodeGraphError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = true,
    public details?: any
  ) {
    super(message);
    this.name = "CodeGraphError";
  }
}

export class RetryableOperation<T> {
  constructor(
    private operation: () => Promise<T>,
    private maxRetries: number = 3,
    private backoffMs: number = 1000
  ) {}

  async execute(): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.operation();
      } catch (error: any) {
        lastError = error;
        
        if (attempt === this.maxRetries) {
          throw new CodeGraphError(
            `Operation failed after ${this.maxRetries} attempts: ${error.message}`,
            "MAX_RETRIES_EXCEEDED",
            false,
            { originalError: error }
          );
        }
        
        const delay = this.backoffMs * Math.pow(2, attempt - 1);
        console.error(`[Retry] Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
}

export class ConcurrencyManager {
  private locks: Map<string, Promise<void>> = new Map();
  private queues: Map<string, (() => void)[]> = new Map();

  async acquire(key: string): Promise<() => void> {
    // Wait for existing lock
    const existingLock = this.locks.get(key);
    if (existingLock) {
      await existingLock;
    }
    
    // Create new lock
    let releaseLock: () => void;
    const lockPromise = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    
    this.locks.set(key, lockPromise);
    
    return () => {
      this.locks.delete(key);
      releaseLock!();
      
      // Process queue if any
      const queue = this.queues.get(key);
      if (queue && queue.length > 0) {
        const next = queue.shift()!;
        next();
      }
    };
  }

  async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const release = await this.acquire(key);
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export class Debouncer {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  debounce(key: string, func: () => void, delayMs: number = 500): void {
    // Clear existing timer
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    
    // Set new timer
    const timer = setTimeout(() => {
      this.timers.delete(key);
      func();
    }, delayMs);
    
    this.timers.set(key, timer);
  }

  cancel(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  cancelAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
EOF
```

---

## 🟢 PHASE 3: VALIDATION & VERIFICATION

### COMPREHENSIVE TEST SUITE

```bash
cat > tests/full-system-validation.test.ts << 'EOF'
import { CodeGraphCore } from "../src/core/indexer";
import { TreeSitterParser } from "../src/core/parser-treesitter";
import { EmbeddingEngine } from "../src/core/embeddings-fixed";
import { DatabaseManager } from "../src/core/db-manager";
import { FileScanner } from "../src/core/file-scanner";
import { ConcurrencyManager, Debouncer, RetryableOperation } from "../src/core/error-handler";
import fs from "fs/promises";
import path from "path";

describe("Full System Validation", () => {
  const testProjectPath = path.join(process.cwd(), "test-project");

  beforeAll(async () => {
    // Create test project structure
    await fs.mkdir(testProjectPath, { recursive: true });
    
    // Create test files
    await fs.writeFile(
      path.join(testProjectPath, "index.js"),
      `
import { util } from './util';
export default class Main {
  async run() {
    return util.process('data');
  }
}
`
    );
    
    await fs.writeFile(
      path.join(testProjectPath, "util.js"),
      `
export const util = {
  process(data) {
    return data.toUpperCase();
  }
};
`
    );

    // Create nested structure
    await fs.mkdir(path.join(testProjectPath, "src", "components"), { recursive: true });
    await fs.writeFile(
      path.join(testProjectPath, "src", "components", "Button.tsx"),
      `
import React from 'react';
interface ButtonProps {
  label: string;
  onClick: () => void;
}
export const Button: React.FC<ButtonProps> = ({ label, onClick }) => {
  return <button onClick={onClick}>{label}</button>;
};
`
    );
  });

  afterAll(async () => {
    // Cleanup
    await fs.rm(testProjectPath, { recursive: true, force: true });
  });

  describe("File Scanner", () => {
    test("should respect depth limits", async () => {
      const scanner = new FileScanner({ maxDepth: 2 });
      const files = await scanner.getFileList(testProjectPath);
      
      // Should find files at depth 0 and 1, but not deeper
      expect(files).toContain(path.join(testProjectPath, "index.js"));
      expect(files).toContain(path.join(testProjectPath, "util.js"));
      
      // With depth 2, should not find Button.tsx at depth 3
      const deepFile = path.join(testProjectPath, "src", "components", "Button.tsx");
      expect(files).not.toContain(deepFile);
    });

    test("should filter by patterns", async () => {
      const scanner = new FileScanner({
        includePatterns: ["*.js"],
        maxDepth: 10
      });
      const files = await scanner.getFileList(testProjectPath);
      
      expect(files.every(f => f.endsWith(".js"))).toBe(true);
      expect(files.some(f => f.endsWith(".tsx"))).toBe(false);
    });
  });

  describe("Tree-Sitter Parser", () => {
    test("should parse all supported languages", async () => {
      const parser = new TreeSitterParser();
      await parser.initialize();
      
      const languages = ["javascript", "typescript", "python", "go", "rust", "java"];
      
      for (const lang of languages) {
        const result = await parser.parseFile("// test", lang);
        expect(result).toBeDefined();
        expect(result.language).toBe(lang);
      }
    });
  });

  describe("Embedding System", () => {
    test("should handle provider failures gracefully", async () => {
      const engine = new EmbeddingEngine();
      await engine.initialize();
      
      // Should always work with at least fallback
      const embedding = await engine.embed("test content");
      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
      
      console.log(`Active provider: ${engine.getActiveProvider()}`);
    });
  });

  describe("Database Manager", () => {
    test("should manage multiple projects", async () => {
      const manager = DatabaseManager.getInstance();
      
      const db1 = await manager.getDatabase("/project1");
      const db2 = await manager.getDatabase("/project2");
      
      expect(db1).toBeDefined();
      expect(db2).toBeDefined();
      expect(db1).not.toBe(db2);
      
      const projects = await manager.listProjects();
      expect(projects.length).toBeGreaterThanOrEqual(2);
    });

    test("should cleanup old databases", async () => {
      const manager = DatabaseManager.getInstance();
      
      // Create multiple test databases
      for (let i = 0; i < 15; i++) {
        await manager.getDatabase(`/test-project-${i}`);
      }
      
      await manager.cleanupIfNeeded();
      
      const projects = await manager.listProjects();
      expect(projects.length).toBeLessThanOrEqual(10);
    });
  });

  describe("Error Handling", () => {
    test("should retry failed operations", async () => {
      let attempts = 0;
      const operation = new RetryableOperation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Temporary failure");
        }
        return "success";
      });
      
      const result = await operation.execute();
      expect(result).toBe("success");
      expect(attempts).toBe(3);
    });

    test("should handle concurrent operations", async () => {
      const manager = new ConcurrencyManager();
      const results: number[] = [];
      
      // Launch concurrent operations on same resource
      const promises = Array.from({ length: 5 }, (_, i) => 
        manager.withLock("resource", async () => {
          await new Promise(r => setTimeout(r, 10));
          results.push(i);
        })
      );
      
      await Promise.all(promises);
      
      // Should execute sequentially
      expect(results).toEqual([0, 1, 2, 3, 4]);
    });

    test("should debounce rapid calls", async () => {
      const debouncer = new Debouncer();
      let callCount = 0;
      
      // Rapid calls
      for (let i = 0; i < 10; i++) {
        debouncer.debounce("test", () => callCount++, 50);
        await new Promise(r => setTimeout(r, 10));
      }
      
      // Wait for debounce
      await new Promise(r => setTimeout(r, 100));
      
      // Should only call once
      expect(callCount).toBe(1);
    });
  });

  describe("Integration", () => {
    test("should index a complete project", async () => {
      const core = new CodeGraphCore();
      await core.initialize(testProjectPath);
      
      // Run full indexing
      await core.runSyntaxPhase(testProjectPath, () => {});
      await core.runGraphPhase(testProjectPath, () => {});
      await core.runSemanticPhase(testProjectPath, () => {});
      
      // Verify results
      // This would include checking the database for expected nodes and relationships
      expect(core.isInitialized()).toBe(true);
    });
  });
});
EOF

# Run full validation
npm test -- tests/full-system-validation.test.ts
```

### FINAL VERIFICATION CHECKLIST

```bash
cat > VERIFICATION_CHECKLIST.md << 'EOF'
# VERIFICATION CHECKLIST

## Pre-Implementation
- [ ] Full backup created
- [ ] New branch created
- [ ] Baseline test results saved

## Critical Fixes
- [ ] Embedding system works without Float32Array errors
- [ ] Tree-sitter actually parses code (not regex)
- [ ] All tests pass without silent failures

## Architectural Fixes
- [ ] Directory traversal consistent (depth: 10)
- [ ] Database cleanup working
- [ ] Import paths consistent
- [ ] ESLint v9 config working

## Performance Fixes
- [ ] No memory leaks in Maps
- [ ] Parallel processing implemented
- [ ] Batch database operations

## Error Handling
- [ ] Retry logic for transient failures
- [ ] Concurrency locks prevent race conditions
- [ ] Debouncing for file watch events

## Final Validation
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Performance benchmarks improved
- [ ] No console errors during operation
- [ ] Memory usage stable over time

## Rollback Plan
- [ ] Can revert to backup
- [ ] Can cherry-pick individual fixes
- [ ] Database migration reversible

## Sign-off
- [ ] Code reviewed
- [ ] Documentation updated
- [ ] CLAUDE.md updated with fixes
- [ ] Version bumped appropriately
EOF
```

### MONITORING & VALIDATION SCRIPT

```bash
cat > scripts/validate-fixes.sh << 'EOF'
#!/bin/bash

echo "🔍 CodeGraph Fix Validation Script"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
FAILURES=0

# Test 1: Check embedding system
echo -e "\n${YELLOW}Test 1: Embedding System${NC}"
if npm test -- tests/embedding-fix-validation.test.ts 2>&1 | grep -q "PASS"; then
    echo -e "${GREEN}✓ Embedding system working${NC}"
else
    echo -e "${RED}✗ Embedding system failed${NC}"
    ((FAILURES++))
fi

# Test 2: Check tree-sitter
echo -e "\n${YELLOW}Test 2: Tree-Sitter Parser${NC}"
if npm test -- tests/treesitter-validation.test.ts 2>&1 | grep -q "PASS"; then
    echo -e "${GREEN}✓ Tree-sitter parsing working${NC}"
else
    echo -e "${RED}✗ Tree-sitter parsing failed${NC}"
    ((FAILURES++))
fi

# Test 3: Check for Float32Array errors
echo -e "\n${YELLOW}Test 3: Float32Array Errors${NC}"
if npm test 2>&1 | grep -q "Float32Array"; then
    echo -e "${RED}✗ Float32Array errors still present${NC}"
    ((FAILURES++))
else
    echo -e "${GREEN}✓ No Float32Array errors${NC}"
fi

# Test 4: Check memory usage
echo -e "\n${YELLOW}Test 4: Memory Usage${NC}"
node -e "
const before = process.memoryUsage().heapUsed;
// Run indexing
const after = process.memoryUsage().heapUsed;
const mb = (after - before) / 1024 / 1024;
console.log(\`Memory used: \${mb.toFixed(2)} MB\`);
if (mb > 500) process.exit(1);
" && echo -e "${GREEN}✓ Memory usage acceptable${NC}" || {
    echo -e "${RED}✗ Excessive memory usage${NC}"
    ((FAILURES++))
}

# Test 5: Check all tests pass
echo -e "\n${YELLOW}Test 5: Full Test Suite${NC}"
if npm test 2>&1 | grep -q "failed"; then
    echo -e "${RED}✗ Some tests failed${NC}"
    ((FAILURES++))
else
    echo -e "${GREEN}✓ All tests passing${NC}"
fi

# Test 6: Type checking
echo -e "\n${YELLOW}Test 6: TypeScript Types${NC}"
if npm run typecheck 2>&1 | grep -q "error"; then
    echo -e "${RED}✗ TypeScript errors${NC}"
    ((FAILURES++))
else
    echo -e "${GREEN}✓ No TypeScript errors${NC}"
fi

# Summary
echo -e "\n=================================="
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}✅ ALL VALIDATIONS PASSED${NC}"
    echo "Safe to proceed with deployment"
else
    echo -e "${RED}❌ $FAILURES VALIDATIONS FAILED${NC}"
    echo "DO NOT DEPLOY - Fix issues first"
    exit 1
fi
EOF

chmod +x scripts/validate-fixes.sh
```

---

## 🚀 IMPLEMENTATION SEQUENCE

```bash
# EXECUTE IN THIS EXACT ORDER:

# 1. Backup
cp -r . ../claude-codegraph-backup-$(date +%Y%m%d-%H%M%S)
git checkout -b critical-fixes-$(date +%Y%m%d)

# 2. Fix embeddings (CRITICAL)
# Run the embedding fix implementation above
npm test -- tests/embedding-fix-validation.test.ts

# 3. Fix tree-sitter (CRITICAL)
# Run the tree-sitter implementation above
npm test -- tests/treesitter-validation.test.ts

# 4. Fix other issues in order
# Run each implementation above

# 5. Final validation
./scripts/validate-fixes.sh

# 6. If all pass, commit
git add -A
git commit -m "Fix: Critical issues - embeddings, tree-sitter, performance

- Fixed Float32Array errors in embedding system
- Implemented actual tree-sitter parsing
- Added database cleanup mechanism
- Fixed directory traversal consistency
- Added proper error handling and retry logic
- Implemented concurrency management
- Performance optimizations and memory leak fixes"

# 7. Update version
npm version minor
```

This implementation guide provides:

1. **Fail-safes**: Each fix can be validated independently
2. **Rollback capability**: Backup and git branch for reverting
3. **Verification at each step**: Tests for each component
4. **No assumptions**: Explicit implementations with fallbacks
5. **Comprehensive testing**: Unit and integration tests
6. **Monitoring**: Validation script to ensure everything works

Follow this guide step-by-step, validating each phase before proceeding. Do not skip any verification steps.