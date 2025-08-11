# Claude CodeGraph MCP

**Deep Codebase Intelligence for Claude Desktop**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![MCP Protocol](https://img.shields.io/badge/MCP-2024--11--05-blue)](https://modelcontextprotocol.io)

## What is CodeGraph?

Claude CodeGraph is a Model Context Protocol (MCP) server that provides Claude Desktop with deep, multi-layered understanding of your codebase. Unlike simple file readers, CodeGraph builds a living knowledge graph of your code, understanding not just syntax but relationships, patterns, and impact.

### 🚀 Key Innovation

CodeGraph introduces **Progressive Codebase Intelligence** - a 5-phase indexing system that gradually builds deeper understanding:

1. **Syntax Understanding** → Parse and understand code structure
2. **Relationship Mapping** → Build a graph of how code connects
3. **Semantic Intelligence** → Understand meaning and similarity
4. **Temporal Awareness** → Track evolution and patterns over time
5. **Query Intelligence** → Smart routing and context building

This progressive approach means Claude can start helping immediately while building deeper insights in the background.

## Why CodeGraph?

### The Problem
When working with large codebases, AI assistants often lack the context to provide meaningful help. They can read individual files but miss the bigger picture - how components connect, what impacts what, and where the important patterns are.

### The Solution
CodeGraph gives Claude a "mental model" of your entire codebase:

- **Instant Navigation**: Find implementations across thousands of files in seconds
- **Impact Analysis**: Understand what breaks when you change something
- **Architecture Understanding**: See the big picture of how your system fits together
- **Smart Search**: Find code by meaning, not just text matching
- **Change Intelligence**: Know what's frequently modified and needs attention

## Core Capabilities

### 🔍 Intelligent Code Search
```
"Find where user authentication is implemented"
"Show me all API endpoints"
"Where is the database connection configured?"
```

### 🕸️ Relationship Tracking
```
"What functions call processPayment?"
"Show me the dependency chain for UserService"
"What would be affected if I change this interface?"
```

### 📊 Architecture Analysis
```
"Explain the architecture of this codebase"
"What are the main modules and how do they interact?"
"Identify architectural patterns used in this project"
```

### 🎯 Impact Assessment
```
"What's the impact of changing the User model?"
"Show me the critical paths in the codebase"
"What are the most coupled components?"
```

### 📈 Code Intelligence
```
"What are the code hotspots?"
"Which files change together frequently?"
"Where is technical debt accumulating?"
```

## Technical Architecture

### Five Layers of Intelligence

#### Layer 1: Syntax Analysis
- Multi-language AST parsing (JavaScript, TypeScript, Python, Go, Rust, Java)
- Function, class, and variable extraction
- Import/export dependency tracking
- Comprehensive code structure understanding

#### Layer 2: Graph Intelligence
- SQLite-powered relationship database
- Directed graph of code dependencies
- Bidirectional relationship tracking
- Weighted connections based on usage

#### Layer 3: Semantic Understanding
- Local transformer models for embeddings
- Semantic similarity search
- Context-aware code matching
- Fallback to intelligent text matching

#### Layer 4: Temporal Intelligence
- Git history integration
- Change pattern detection
- Co-modification analysis
- Refactoring detection

#### Layer 5: Query Routing
- Intent classification
- Multi-strategy search
- Progressive context building
- Result ranking and filtering

### Progressive Enhancement Model

CodeGraph doesn't make you wait. It provides value immediately and gets smarter over time:

```
Phase 1 (0-10s): Basic syntax analysis available
Phase 2 (10-30s): Relationship graph ready
Phase 3 (30-60s): Semantic search online
Phase 4 (1-2min): Git history analyzed
Phase 5 (2min+): Full intelligence available
```

## MCP Integration

### Available Tools (8)

| Tool | Description | Capability Required |
|------|-------------|-------------------|
| `get_indexing_status` | Real-time indexing progress | Always available |
| `get_capabilities` | Check available features | Always available |
| `wait_for_indexing` | Wait for analysis completion | Always available |
| `analyze_codebase` | Full codebase analysis | Syntax analysis |
| `find_implementation` | Semantic code search | Syntax analysis |
| `trace_execution` | Execution path tracing | Graph relationships |
| `impact_analysis` | Change impact assessment | Graph relationships |
| `explain_architecture` | Architecture explanation | Graph relationships |

### Available Resources (5)

| Resource | Description | Updates |
|----------|-------------|---------|
| `codegraph://architecture` | High-level architecture view | On file change |
| `codegraph://dependencies` | Dependency visualization | On package change |
| `codegraph://hotspots` | Frequently changed code | On git commit |
| `codegraph://status` | Current indexing status | Real-time |
| `codegraph://metrics` | Code quality metrics | On indexing complete |

## Installation

### Quick Start

1. Clone the repository:
```bash
git clone https://github.com/chatcbdai/claude-codegraph-mcp.git
cd claude-codegraph-mcp
```

2. Install and build:
```bash
npm install
npm run build
```

3. Add to Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "codegraph": {
      "command": "node",
      "args": ["/absolute/path/to/claude-codegraph-mcp/dist/index.js"]
    }
  }
}
```

4. Restart Claude Desktop

See [detailed installation guide](docs/how-to-install.md) for IDE integration and advanced configuration.

## 📚 How-To Guides

Get started quickly with our comprehensive guides:

### [Installation Guide](docs/how-to-install.md)
Complete setup instructions for Claude Desktop, IDE integration, and troubleshooting.

### [Using in VS Code](docs/how-to-use-in-vscode.md)
Leverage CodeGraph's full power directly from VS Code's integrated terminal with automatic workspace detection.

### [Using in Mac Terminal](docs/how-to-use-in-mac-terminal.md)
Master CodeGraph from the command line with project navigation, advanced workflows, and Mac-specific tips.

## Usage Examples

### Basic Usage

Once installed, CodeGraph automatically activates when you open Claude Code in a project directory. No manual activation needed!

### Example Queries

**Understanding Code:**
```
"Explain how the authentication system works"
"What's the data flow for processing orders?"
"How is caching implemented in this project?"
```

**Finding Code:**
```
"Where is the email validation logic?"
"Find all database queries related to users"
"Show me the API rate limiting implementation"
```

**Analyzing Impact:**
```
"What happens if I change the Product schema?"
"Which components depend on the Redis client?"
"What's the blast radius of refactoring UserService?"
```

**Architecture Review:**
```
"Identify architectural anti-patterns"
"What are the most complex parts of the codebase?"
"Show me the service boundaries"
```

## Performance

### Benchmarks

| Codebase Size | Initial Index | Incremental Update | Memory Usage |
|---------------|---------------|-------------------|--------------|
| Small (< 1K files) | 5-10s | < 1s | ~100MB |
| Medium (1K-10K) | 30-60s | 1-2s | ~500MB |
| Large (10K-50K) | 2-5min | 2-5s | ~2GB |

### Optimization

CodeGraph includes several optimizations:
- **Incremental indexing** for file changes
- **Parallel processing** for multi-core systems
- **Smart caching** of embeddings and relationships
- **Lazy loading** of analysis modules
- **Project-specific databases** for isolation

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CODEGRAPH_MAX_FILES` | Maximum files to index | 10000 |
| `CODEGRAPH_INDEX_DEPTH` | Directory traversal depth | 10 |
| `CODEGRAPH_ENABLE_GIT` | Enable git analysis | true |
| `CODEGRAPH_IGNORE_PATTERNS` | Additional ignore patterns | none |

### Ignored Patterns

By default, CodeGraph ignores:
- `node_modules/`
- `.git/`
- `dist/`, `build/`
- Binary files
- Files over 1MB

## Architecture

### System Components

```
┌─────────────────────────────────────────────────┐
│                 Claude Desktop                   │
└────────────────────┬────────────────────────────┘
                     │ MCP Protocol
┌────────────────────▼────────────────────────────┐
│              CodeGraph MCP Server                │
├──────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐            │
│  │   Handlers   │  │ Auto-Indexer │            │
│  └──────┬───────┘  └──────┬───────┘            │
│         │                  │                     │
│  ┌──────▼──────────────────▼──────┐            │
│  │        Core Indexer             │            │
│  └──────┬──────────────────────────┘            │
│         │                                        │
│  ┌──────▼───────┬────────┬──────────┐          │
│  │   Parser     │ Graph  │ Embeddings│          │
│  └──────────────┴────────┴──────────┘          │
│                                                  │
│  ┌────────────────────────────────────┐        │
│  │     Intelligence Modules           │        │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ │        │
│  │  │Semantic│ │Temporal│ │ Query  │ │        │
│  │  └────────┘ └────────┘ └────────┘ │        │
│  └────────────────────────────────────┘        │
└──────────────────────────────────────────────────┘
```

### Data Flow

1. **File System** → Parser → AST Extraction
2. **AST** → Graph Builder → Relationships
3. **Code Content** → Embeddings → Semantic Index
4. **Git History** → Temporal Analyzer → Patterns
5. **All Indexes** → Query Router → Results

## Language Support

### Fully Supported
- ✅ JavaScript/TypeScript (`.js`, `.jsx`, `.ts`, `.tsx`)
- ✅ Python (`.py`)
- ✅ Go (`.go`)
- ✅ Rust (`.rs`)
- ✅ Java (`.java`)

### Partially Supported
- ⚠️ C/C++ (basic parsing)
- ⚠️ Ruby (basic parsing)
- ⚠️ PHP (basic parsing)

### Planned
- 🔄 C# / .NET
- 🔄 Swift
- 🔄 Kotlin

## Contributing

We welcome contributions! Please submit issues and pull requests on GitHub.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/chatcbdai/claude-codegraph-mcp.git
cd claude-codegraph-mcp

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck
```

## Roadmap

### Near Term
- [ ] C# and .NET support
- [ ] WebAssembly module for browser-based indexing
- [ ] Real-time collaborative indexing
- [ ] Custom query language

### Long Term
- [ ] Machine learning-based pattern detection
- [ ] Automated refactoring suggestions
- [ ] Cross-repository intelligence
- [ ] IDE plugins for real-time sync

## Support

- **Issues**: [GitHub Issues](https://github.com/chatcbdai/claude-codegraph-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/chatcbdai/claude-codegraph-mcp/discussions)
- **Documentation**: [How-To Guides](docs/)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

Built with:
- [Model Context Protocol](https://modelcontextprotocol.io) by Anthropic
- [Tree-sitter](https://tree-sitter.github.io) for parsing
- [Transformers.js](https://xenova.github.io/transformers.js/) for embeddings
- [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3) for graph storage

---

**Made with ❤️ for the Claude Desktop community**