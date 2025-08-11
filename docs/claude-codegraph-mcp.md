# Claude CodeGraph MCP: Universal Codebase Intelligence for Claude Code

## Executive Summary

After extensive research into the current landscape of code understanding tools, I’ve designed CodeGraph MCP - a comprehensive solution that fundamentally transforms how Claude Code understands large codebases. This isn’t another basic RAG tool that chunks text and searches for similarities. Instead, it’s a multi-layered intelligence system that understands code structure, relationships, and evolution.

## The Problem Analysis

### Current State

Basic RAG tools (Continue.dev, claude-context): Only find “similar” code via embeddings
Limited understanding: No awareness of architectural relationships or code flow
Context fragmentation: Critical context scattered across multiple files gets lost
Static snapshots: No understanding of how code evolved or why
### What Claude Code Actually Needs

Structural Understanding: Know how classes, functions, and modules relate
Execution Flow: Trace how data flows through the system
Impact Analysis: Understand what changes when you modify code
Historical Context: Know why code exists and how it evolved
Universal Access: Work across ALL projects without per-project setup
## The Solution: CodeGraph MCP Architecture

### Core Design Philosophy

Instead of treating code as text to be searched, we treat it as:

A living graph of interconnected components
An evolving system with meaningful history
A structured domain with specific rules and patterns
### System Architecture

┌─────────────────────────────────────────────────────────────┐
│                     CodeGraph MCP Server                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Layer 1: Syntax Intelligence (Tree-sitter)                  │
│  ├── AST Parsing for 30+ languages                          │
│  ├── Syntax-aware chunking                                  │
│  └── Structure extraction                                    │
│                                                               │
│  Layer 2: Graph Intelligence (Neo4j/SQLite)                  │
│  ├── Dependency graphs                                       │
│  ├── Call graphs                                            │
│  ├── Type relationships                                      │
│  └── Import/export mappings                                  │
│                                                               │
│  Layer 3: Semantic Intelligence (Embeddings)                 │
│  ├── Local embeddings (all-MiniLM-L6-v2)                    │
│  ├── Hybrid search (BM25 + dense)                          │
│  └── Context-aware retrieval                                │
│                                                               │
│  Layer 4: Temporal Intelligence (Git)                        │
│  ├── Change history tracking                                │
│  ├── Refactoring detection                                  │
│  └── Evolution patterns                                      │
│                                                               │
│  Layer 5: Query Intelligence (MCP Interface)                 │
│  ├── Smart query routing                                    │
│  ├── Progressive context building                           │
│  └── Multi-strategy retrieval                              │
└─────────────────────────────────────────────────────────────┘
## Detailed Implementation Plan

### Phase 1: Foundation (Week 1)

#### 1.1 Project Structure

codegraph-mcp/
├── src/
│   ├── index.ts                 # MCP server entry point
│   ├── handlers/
│   │   ├── tools.ts            # MCP tool implementations
│   │   ├── resources.ts        # Resource handlers
│   │   └── prompts.ts          # Prompt templates
│   ├── core/
│   │   ├── parser.ts           # Tree-sitter integration
│   │   ├── graph.ts            # Graph database operations
│   │   ├── embeddings.ts       # Embedding generation
│   │   └── indexer.ts          # Main indexing logic
│   ├── intelligence/
│   │   ├── structural.ts       # Code structure analysis
│   │   ├── semantic.ts         # Semantic search
│   │   ├── temporal.ts         # Git history analysis
│   │   └── query.ts            # Query routing
│   └── utils/
│       ├── cache.ts            # Caching layer
│       ├── chunker.ts          # Smart code chunking
│       └── logger.ts           # Logging utilities
├── config/
│   ├── languages.json          # Language configurations
│   └── defaults.json           # Default settings
├── tests/
├── docs/
└── package.json
#### 1.2 Core Dependencies

{
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "tree-sitter": "^0.20.0",
    "tree-sitter-typescript": "latest",
    "tree-sitter-python": "latest",
    "tree-sitter-javascript": "latest",
    "neo4j-driver": "^5.0.0",
    "better-sqlite3": "^9.0.0",
    "@xenova/transformers": "^2.0.0",
    "simple-git": "^3.0.0",
    "chokidar": "^3.5.0",
    "p-queue": "^7.0.0"
  }
}
#### 1.3 MCP Server Setup

// src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CodeGraphHandlers } from "./handlers/index.js";

class CodeGraphMCPServer {
  private server: Server;
  private handlers: CodeGraphHandlers;

  constructor() {
    this.server = new Server(
      {
        name: "codegraph-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );
    
    this.handlers = new CodeGraphHandlers(this.server);
  }

  async start() {
    await this.handlers.setup();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Use stderr for logging (stdout is for MCP protocol)
    console.error("[CodeGraph] Server started successfully");
  }
}

// Start server
const server = new CodeGraphMCPServer();
server.start().catch(console.error);
### Phase 2: Intelligent Parsing (Week 1-2)

#### 2.1 Tree-sitter Integration

// src/core/parser.ts
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import Python from 'tree-sitter-python';
import JavaScript from 'tree-sitter-javascript';

export class CodeParser {
  private parsers: Map<string, Parser>;
  
  constructor() {
    this.parsers = new Map();
    this.initializeParsers();
  }
  
  private initializeParsers() {
    const languages = {
      'typescript': TypeScript.typescript,
      'javascript': JavaScript,
      'python': Python,
      // Add more languages
    };
    
    for (const [lang, grammar] of Object.entries(languages)) {
      const parser = new Parser();
      parser.setLanguage(grammar);
      this.parsers.set(lang, parser);
    }
  }
  
  async parseFile(content: string, language: string): Promise<ParsedFile> {
    const parser = this.parsers.get(language);
    if (!parser) throw new Error(`Unsupported language: ${language}`);
    
    const tree = parser.parse(content);
    return this.extractStructure(tree, content, language);
  }
  
  private extractStructure(tree: any, content: string, language: string): ParsedFile {
    const structure = {
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      dependencies: [],
    };
    
    // Walk the AST and extract structural elements
    this.walkTree(tree.rootNode, structure, content, language);
    
    return structure;
  }
  
  private walkTree(node: any, structure: any, content: string, language: string) {
    // Language-specific AST traversal
    switch (language) {
      case 'typescript':
      case 'javascript':
        this.walkJSTree(node, structure, content);
        break;
      case 'python':
        this.walkPythonTree(node, structure, content);
        break;
    }
  }
}
#### 2.2 Smart Chunking Strategy

// src/utils/chunker.ts
export class SmartChunker {
  constructor(
    private maxChunkSize: number = 1500,
    private overlapSize: number = 200
  ) {}
  
  chunkCode(parsedFile: ParsedFile, content: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    
    // Priority 1: Keep complete functions/methods together
    for (const func of parsedFile.functions) {
      if (func.length <= this.maxChunkSize) {
        chunks.push(this.createChunk(func, 'function'));
      } else {
        // Split large functions intelligently
        chunks.push(...this.splitLargeFunction(func));
      }
    }
    
    // Priority 2: Keep complete classes together
    for (const cls of parsedFile.classes) {
      if (cls.length <= this.maxChunkSize) {
        chunks.push(this.createChunk(cls, 'class'));
      } else {
        // Split by methods but keep class context
        chunks.push(...this.splitClass(cls));
      }
    }
    
    // Priority 3: Module-level code with imports
    chunks.push(...this.chunkModuleLevel(parsedFile, content));
    
    return chunks;
  }
  
  private createChunk(element: any, type: string): CodeChunk {
    return {
      id: generateId(),
      type,
      content: element.content,
      metadata: {
        file: element.file,
        startLine: element.startLine,
        endLine: element.endLine,
        name: element.name,
        imports: element.imports,
        exports: element.exports,
        calls: element.calls,
        references: element.references,
      }
    };
  }
}
### Phase 3: Graph Intelligence (Week 2)

#### 3.1 Graph Database Integration

// src/core/graph.ts
import neo4j from 'neo4j-driver';
import Database from 'better-sqlite3';

export class CodeGraph {
  private driver: any;
  private sqlite: Database.Database;
  
  constructor(config: GraphConfig) {
    if (config.type === 'neo4j') {
      this.driver = neo4j.driver(
        config.uri,
        neo4j.auth.basic(config.user, config.password)
      );
    } else {
      // Use SQLite for simpler setups
      this.sqlite = new Database(config.path || ':memory:');
      this.initializeSQLite();
    }
  }
  
  async addNode(node: CodeNode) {
    const query = `
      MERGE (n:${node.type} {id: $id})
      SET n.name = $name,
          n.file = $file,
          n.content = $content,
          n.metadata = $metadata
      RETURN n
    `;
    
    await this.run(query, node);
  }
  
  async addRelationship(from: string, to: string, type: RelationType) {
    const query = `
      MATCH (a {id: $from}), (b {id: $to})
      MERGE (a)-[r:${type}]->(b)
      SET r.weight = coalesce(r.weight, 0) + 1
      RETURN r
    `;
    
    await this.run(query, { from, to });
  }
  
  async findRelated(nodeId: string, depth: number = 2): Promise<CodeNode[]> {
    const query = `
      MATCH (n {id: $nodeId})-[*1..${depth}]-(related)
      RETURN DISTINCT related
      ORDER BY related.relevance DESC
      LIMIT 20
    `;
    
    return await this.run(query, { nodeId });
  }
  
  async impactAnalysis(nodeId: string): Promise<ImpactResult> {
    // Find all nodes that depend on this one
    const dependents = await this.findDependents(nodeId);
    
    // Find all nodes this one depends on
    const dependencies = await this.findDependencies(nodeId);
    
    // Calculate impact score
    const impactScore = this.calculateImpactScore(dependents, dependencies);
    
    return {
      directImpact: dependents.filter(d => d.distance === 1),
      indirectImpact: dependents.filter(d => d.distance > 1),
      criticalPaths: this.findCriticalPaths(nodeId, dependents),
      score: impactScore
    };
  }
}
#### 3.2 Relationship Extraction

// src/intelligence/structural.ts
export class StructuralAnalyzer {
  async analyzeRelationships(parsedFiles: ParsedFile[]): Promise<Relationship[]> {
    const relationships: Relationship[] = [];
    
    // Build import/export map
    const exportMap = this.buildExportMap(parsedFiles);
    
    for (const file of parsedFiles) {
      // Analyze imports
      for (const imp of file.imports) {
        const resolved = this.resolveImport(imp, exportMap);
        if (resolved) {
          relationships.push({
            from: file.path,
            to: resolved.file,
            type: 'IMPORTS',
            details: { symbol: imp.symbol }
          });
        }
      }
      
      // Analyze function calls
      for (const func of file.functions) {
        for (const call of func.calls) {
          const target = this.resolveCall(call, exportMap);
          if (target) {
            relationships.push({
              from: func.id,
              to: target.id,
              type: 'CALLS',
              details: { arguments: call.arguments }
            });
          }
        }
      }
      
      // Analyze class inheritance
      for (const cls of file.classes) {
        if (cls.extends) {
          const parent = this.resolveClass(cls.extends, exportMap);
          if (parent) {
            relationships.push({
              from: cls.id,
              to: parent.id,
              type: 'EXTENDS',
              details: {}
            });
          }
        }
      }
    }
    
    return relationships;
  }
}
### Phase 4: Semantic Intelligence (Week 2-3)

#### 4.1 Local Embeddings

// src/core/embeddings.ts
import { pipeline } from '@xenova/transformers';

export class EmbeddingEngine {
  private model: any;
  private cache: Map<string, Float32Array>;
  
  async initialize() {
    // Use local model for privacy and speed
    this.model = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
    this.cache = new Map();
  }
  
  async embed(text: string): Promise<Float32Array> {
    // Check cache first
    const cacheKey = this.hashText(text);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    // Generate embedding
    const output = await this.model(text, {
      pooling: 'mean',
      normalize: true
    });
    
    const embedding = new Float32Array(output.data);
    this.cache.set(cacheKey, embedding);
    
    return embedding;
  }
  
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
  
  cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }
    return dotProduct; // Already normalized
  }
}
#### 4.2 Hybrid Search

// src/intelligence/semantic.ts
export class HybridSearch {
  constructor(
    private embeddings: EmbeddingEngine,
    private graph: CodeGraph
  ) {}
  
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
  
  private async semanticSearch(query: string, context: SearchContext) {
    const queryEmbedding = await this.embeddings.embed(query);
    
    // Search in vector store
    const candidates = await this.vectorStore.search(
      queryEmbedding,
      context.limit * 3 // Over-fetch for re-ranking
    );
    
    // Re-rank based on context
    return this.contextualRerank(candidates, context);
  }
  
  private fuseResults(...resultSets: SearchResult[][]): SearchResult[] {
    // Reciprocal Rank Fusion
    const scores = new Map<string, number>();
    
    for (const results of resultSets) {
      for (let i = 0; i < results.length; i++) {
        const id = results[i].id;
        const rank = i + 1;
        const score = 1 / (rank + 60); // RRF constant
        
        scores.set(id, (scores.get(id) || 0) + score);
      }
    }
    
    // Sort by fused score
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, score]) => this.getResultById(id, score));
  }
}
### Phase 5: Temporal Intelligence (Week 3)

#### 5.1 Git History Analysis

// src/intelligence/temporal.ts
import simpleGit from 'simple-git';

export class TemporalAnalyzer {
  private git: any;
  
  constructor(repoPath: string) {
    this.git = simpleGit(repoPath);
  }
  
  async analyzeEvolution(filePath: string): Promise<Evolution> {
    const log = await this.git.log({
      file: filePath,
      '--follow': true, // Track renames
      '-p': true // Include patches
    });
    
    const evolution: Evolution = {
      changes: [],
      refactorings: [],
      patterns: []
    };
    
    for (const commit of log.all) {
      const change = await this.analyzeCommit(commit, filePath);
      evolution.changes.push(change);
      
      // Detect refactorings
      if (this.isRefactoring(change)) {
        evolution.refactorings.push({
          type: this.detectRefactoringType(change),
          commit: commit.hash,
          date: commit.date,
          description: this.describeRefactoring(change)
        });
      }
    }
    
    // Identify patterns
    evolution.patterns = this.identifyPatterns(evolution.changes);
    
    return evolution;
  }
  
  async getContextAtCommit(filePath: string, commitHash: string): Promise<string> {
    const content = await this.git.show([
      `${commitHash}:${filePath}`
    ]);
    return content;
  }
  
  async findRelatedChanges(change: Change): Promise<Change[]> {
    // Find changes that happened together
    const coChanges = await this.git.log({
      from: change.commit,
      to: change.commit,
      '--name-only': true
    });
    
    return coChanges;
  }
}
### Phase 6: MCP Interface (Week 3-4)

#### 6.1 Tool Definitions

// src/handlers/tools.ts
export class ToolHandlers {
  constructor(private core: CodeGraphCore) {}
  
  getTools() {
    return [
      {
        name: "analyze_codebase",
        description: "Analyze entire codebase structure and relationships",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to codebase" },
            depth: { type: "number", description: "Analysis depth (1-5)" }
          }
        }
      },
      {
        name: "find_implementation",
        description: "Find where something is implemented",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "What to find" },
            context: { type: "string", description: "Additional context" }
          }
        }
      },
      {
        name: "trace_execution",
        description: "Trace execution flow through the codebase",
        inputSchema: {
          type: "object",
          properties: {
            entryPoint: { type: "string", description: "Starting point" },
            maxDepth: { type: "number", description: "Max call depth" }
          }
        }
      },
      {
        name: "impact_analysis",
        description: "Analyze impact of changing a component",
        inputSchema: {
          type: "object",
          properties: {
            component: { type: "string", description: "Component to analyze" },
            changeType: { type: "string", enum: ["modify", "delete", "rename"] }
          }
        }
      },
      {
        name: "explain_architecture",
        description: "Explain the architecture of a module or system",
        inputSchema: {
          type: "object",
          properties: {
            scope: { type: "string", description: "Module or directory" },
            level: { type: "string", enum: ["high", "detailed"] }
          }
        }
      }
    ];
  }
  
  async handleToolCall(name: string, args: any): Promise<ToolResult> {
    switch (name) {
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
  
  private async findImplementation(args: any): Promise<ToolResult> {
    // Multi-strategy search
    const strategies = [
      () => this.core.semantic.search(args.query, { type: 'implementation' }),
      () => this.core.graph.findByPattern(args.query),
      () => this.core.structural.findDefinition(args.query)
    ];
    
    const results = await Promise.all(strategies.map(s => s()));
    const merged = this.mergeResults(results);
    
    return {
      content: [{
        type: "text",
        text: this.formatImplementationResults(merged)
      }]
    };
  }
}
#### 6.2 Resource Handlers

// src/handlers/resources.ts
export class ResourceHandlers {
  getResources() {
    return [
      {
        uri: "codegraph://architecture",
        name: "Codebase Architecture",
        description: "High-level architecture overview"
      },
      {
        uri: "codegraph://dependencies",
        name: "Dependency Graph",
        description: "Project dependencies and relationships"
      },
      {
        uri: "codegraph://hotspots",
        name: "Code Hotspots",
        description: "Frequently changed or complex areas"
      }
    ];
  }
  
  async getResource(uri: string): Promise<ResourceContent> {
    const path = uri.replace('codegraph://', '');
    
    switch (path) {
      case 'architecture':
        return await this.getArchitecture();
      case 'dependencies':
        return await this.getDependencies();
      case 'hotspots':
        return await this.getHotspots();
    }
  }
  
  private async getArchitecture(): Promise<ResourceContent> {
    const modules = await this.core.structural.getModules();
    const layers = await this.core.structural.detectLayers();
    const patterns = await this.core.structural.detectPatterns();
    
    return {
      type: "text",
      text: this.formatArchitecture(modules, layers, patterns),
      mimeType: "text/markdown"
    };
  }
}
#### 6.3 Smart Query Router

// src/intelligence/query.ts
export class QueryRouter {
  async route(query: string, context: QueryContext): Promise<RoutedQuery> {
    // Classify query intent
    const intent = await this.classifyIntent(query);
    
    // Determine optimal strategy
    const strategy = this.selectStrategy(intent, context);
    
    // Build query plan
    const plan = this.buildQueryPlan(strategy, query, context);
    
    return {
      intent,
      strategy,
      plan,
      execute: () => this.executePlan(plan)
    };
  }
  
  private async classifyIntent(query: string): Promise<QueryIntent> {
    const patterns = {
      architecture: /architecture|structure|design|pattern/i,
      implementation: /where|implement|define|located/i,
      flow: /flow|execution|trace|path/i,
      impact: /impact|affect|change|modify/i,
      evolution: /history|evolution|changed|refactor/i,
      relationship: /relate|depend|connect|use/i
    };
    
    for (const [intent, pattern] of Object.entries(patterns)) {
      if (pattern.test(query)) {
        return intent as QueryIntent;
      }
    }
    
    // Use LLM for complex queries
    return await this.llmClassify(query);
  }
  
  private selectStrategy(intent: QueryIntent, context: QueryContext): Strategy {
    const strategies = {
      architecture: ['graph', 'structural'],
      implementation: ['semantic', 'graph', 'keyword'],
      flow: ['graph', 'temporal'],
      impact: ['graph', 'structural'],
      evolution: ['temporal', 'graph'],
      relationship: ['graph', 'semantic']
    };
    
    return strategies[intent] || ['semantic', 'keyword'];
  }
}
### Phase 7: Installation & Configuration (Week 4)

#### 7.1 Global Installation Script

#!/bin/bash
# install.sh

echo "Installing CodeGraph MCP Server..."

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed."; exit 1; }
command -v git >/dev/null 2>&1 || { echo "Git is required but not installed."; exit 1; }

# Clone repository
git clone https://github.com/your-org/codegraph-mcp.git ~/.codegraph-mcp
cd ~/.codegraph-mcp

# Install dependencies
npm install

# Build
npm run build

# Register with Claude Code (global scope)
claude mcp add codegraph --scope user \
  --env CODEGRAPH_HOME="$HOME/.codegraph-mcp" \
  --env CODEGRAPH_DB="$HOME/.codegraph-mcp/db" \
  -- node "$HOME/.codegraph-mcp/dist/index.js"

echo "CodeGraph MCP Server installed successfully!"
echo "Restart Claude Code to activate."
#### 7.2 Configuration File

// ~/.codegraph-mcp/config.json
{
  "indexing": {
    "languages": ["typescript", "javascript", "python", "go", "rust", "java"],
    "ignorePaths": ["node_modules", ".git", "dist", "build", "__pycache__"],
    "maxFileSize": 1048576,
    "chunkSize": 1500,
    "chunkOverlap": 200
  },
  "graph": {
    "type": "sqlite",
    "path": "~/.codegraph-mcp/db/graph.db",
    "maxDepth": 5
  },
  "embeddings": {
    "model": "Xenova/all-MiniLM-L6-v2",
    "dimension": 384,
    "batchSize": 32
  },
  "search": {
    "topK": 20,
    "minScore": 0.7,
    "strategies": ["semantic", "keyword", "graph"]
  },
  "cache": {
    "enabled": true,
    "ttl": 3600,
    "maxSize": "500MB"
  },
  "performance": {
    "maxWorkers": 4,
    "indexingConcurrency": 10,
    "incrementalUpdate": true
  }
}
### Phase 8: Advanced Features

#### 8.1 Incremental Indexing

// src/core/indexer.ts
export class IncrementalIndexer {
  private watcher: any;
  private queue: PQueue;
  private merkleTree: Map<string, string>;
  
  async watchDirectory(path: string) {
    this.watcher = chokidar.watch(path, {
      ignored: this.config.ignorePaths,
      persistent: true
    });
    
    this.watcher
      .on('add', path => this.queueFile(path, 'add'))
      .on('change', path => this.queueFile(path, 'update'))
      .on('unlink', path => this.queueFile(path, 'delete'));
  }
  
  private async queueFile(path: string, action: string) {
    await this.queue.add(async () => {
      const hash = await this.hashFile(path);
      
      if (action === 'delete') {
        await this.removeFromIndex(path);
      } else if (this.hasChanged(path, hash)) {
        await this.reindexFile(path);
        this.merkleTree.set(path, hash);
      }
    });
  }
  
  private hasChanged(path: string, newHash: string): boolean {
    const oldHash = this.merkleTree.get(path);
    return oldHash !== newHash;
  }
}
#### 8.2 Context Building

// src/intelligence/context.ts
export class ContextBuilder {
  async buildProgressiveContext(
    query: string,
    startPoint: CodeNode,
    maxTokens: number
  ): Promise<Context> {
    const context = new Context(maxTokens);
    
    // Layer 1: Direct context
    context.add(startPoint, Priority.CRITICAL);
    
    // Layer 2: Immediate dependencies
    const deps = await this.graph.getDirectDependencies(startPoint.id);
    for (const dep of deps) {
      if (!context.hasSpace()) break;
      context.add(dep, Priority.HIGH);
    }
    
    // Layer 3: Related by semantic similarity
    const similar = await this.semantic.findSimilar(startPoint);
    for (const node of similar) {
      if (!context.hasSpace()) break;
      context.add(node, Priority.MEDIUM);
    }
    
    // Layer 4: Historical context
    const history = await this.temporal.getRecentChanges(startPoint);
    for (const change of history) {
      if (!context.hasSpace()) break;
      context.add(change, Priority.LOW);
    }
    
    return context.optimize(); // Reorder for coherence
  }
}
### Phase 9: Testing & Validation

#### 9.1 Test Suite

// tests/integration.test.ts
describe('CodeGraph MCP Integration', () => {
  let server: CodeGraphMCPServer;
  
  beforeAll(async () => {
    server = new CodeGraphMCPServer();
    await server.initialize();
  });
  
  test('should index a TypeScript project', async () => {
    const result = await server.indexProject('./test-projects/typescript');
    expect(result.filesIndexed).toBeGreaterThan(0);
    expect(result.nodesCreated).toBeGreaterThan(0);
    expect(result.relationshipsCreated).toBeGreaterThan(0);
  });
  
  test('should find implementations accurately', async () => {
    const result = await server.tools.findImplementation({
      query: 'authentication middleware'
    });
    
    expect(result.results).toHaveLength(greaterThan(0));
    expect(result.results[0].relevance).toBeGreaterThan(0.8);
  });
  
  test('should trace execution paths', async () => {
    const trace = await server.tools.traceExecution({
      entryPoint: 'handleRequest',
      maxDepth: 5
    });
    
    expect(trace.path).toBeDefined();
    expect(trace.branches).toBeDefined();
  });
});
### Phase 10: Documentation & User Experience

#### 10.1 User Documentation

# CodeGraph MCP - User Guide

## Quick Start
1. Install: `curl -sSL https://codegraph.dev/install.sh | bash`
2. Restart Claude Code
3. Use: `@codegraph find authentication logic`

## Available Commands

### Natural Language Queries
- "Where is user authentication implemented?"
- "Show me how data flows from API to database"
- "What would break if I change this function?"
- "How has this module evolved over time?"

### Advanced Features
- Architecture visualization
- Dependency analysis
- Impact assessment
- Code evolution tracking

## Performance Tips
- First indexing takes 2-5 minutes for large codebases
- Subsequent updates are incremental (seconds)
- Use `.codegraphignore` to exclude unnecessary files
## Success Metrics

### Performance Targets

Indexing Speed: 10,000 files in < 5 minutes
Query Response: < 500ms for most queries
Memory Usage: < 500MB for typical projects
Accuracy: > 90% relevant results in top 5
### Quality Metrics

Context Quality: Coherent, complete context windows
Relationship Accuracy: Correctly identify 95%+ of dependencies
Evolution Tracking: Detect all major refactorings
## Conclusion

CodeGraph MCP represents a paradigm shift in how AI understands code. By combining:

Syntax-aware parsing (Tree-sitter)
Graph-based relationships (Neo4j/SQLite)
Semantic understanding (Local embeddings)
Temporal intelligence (Git history)
Smart query routing (Multi-strategy retrieval)
We create a system that doesn’t just search code but truly understands it. This enables Claude Code to:

Navigate complex architectures effortlessly
Understand impact before making changes
Learn from code evolution patterns
Provide context-aware suggestions