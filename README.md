# Claude CodeGraph MCP

Universal Codebase Intelligence for Claude Code - A comprehensive MCP server that provides deep code understanding through multi-layered analysis.

## Features

### 🧠 Multi-Layered Intelligence
- **Syntax Intelligence**: AST parsing for 30+ languages
- **Graph Intelligence**: Dependency and relationship tracking
- **Semantic Intelligence**: Code similarity and intelligent search
- **Temporal Intelligence**: Git history and evolution analysis
- **Query Intelligence**: Smart routing and context building

### ⚡ Automatic Background Indexing
- Auto-triggers when Claude Code starts
- Progressive capability unlocking
- Real-time status updates
- Works seamlessly in the background

### 🎯 Progressive Enhancement
- Tools adapt based on available capabilities
- Graceful degradation during indexing
- Always provides value, even with partial data

## Installation

### Quick Install

```bash
# Clone the repository
git clone https://github.com/your-org/codegraph-mcp.git
cd codegraph-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Configure Claude Code
npx claude-mcp configure
```

### Manual Configuration

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "codegraph": {
      "command": "node",
      "args": ["/path/to/codegraph-mcp/dist/index.js"],
      "env": {
        "CODEGRAPH_HOME": "/path/to/codegraph-mcp",
        "CODEGRAPH_DB": "/path/to/codegraph-mcp/db"
      }
    }
  }
}
```

## Usage

### Available Tools

#### Status and Capabilities
- `get_indexing_status` - Check current indexing progress
- `get_capabilities` - See available features
- `wait_for_indexing` - Wait for indexing to complete

#### Code Analysis
- `analyze_codebase` - Comprehensive codebase analysis
- `find_implementation` - Locate where features are implemented
- `trace_execution` - Follow execution flow
- `impact_analysis` - Assess change impact
- `explain_architecture` - Understand system architecture

### Example Usage

```typescript
// Check indexing status
await get_indexing_status({ path: "/my/project" });

// Find implementation
await find_implementation({ 
  query: "authentication middleware",
  context: "Express.js application"
});

// Trace execution
await trace_execution({
  entryPoint: "handleRequest",
  maxDepth: 5
});

// Analyze impact
await impact_analysis({
  component: "UserService",
  changeType: "modify"
});
```

### Available Resources

Access these resources through Claude Code:
- `codegraph://architecture` - Architecture overview
- `codegraph://dependencies` - Dependency graph
- `codegraph://hotspots` - Code hotspots
- `codegraph://status` - Indexing status
- `codegraph://metrics` - Code metrics

## How It Works

### 1. Automatic Indexing
When you start Claude Code in a project directory, CodeGraph automatically:
- Detects the codebase
- Starts background indexing
- Progressively unlocks capabilities

### 2. Progressive Enhancement
As indexing progresses, tools become smarter:
- **0-25%**: Basic syntax analysis
- **25-50%**: Relationship mapping
- **50-75%**: Semantic search
- **75-90%**: Historical analysis
- **90-100%**: Full intelligence

### 3. Smart Query Routing
CodeGraph automatically:
- Classifies query intent
- Selects optimal search strategies
- Combines multiple data sources
- Returns contextualized results

## Configuration

### Environment Variables

```bash
# Database location (default: ~/.codegraph/db)
CODEGRAPH_DB=/path/to/database

# Max indexing threads (default: 4)
CODEGRAPH_WORKERS=8

# Log level (default: INFO)
CODEGRAPH_LOG_LEVEL=DEBUG
```

### Configuration File

Create `~/.codegraph/config.json`:

```json
{
  "indexing": {
    "languages": ["typescript", "javascript", "python"],
    "ignorePaths": ["node_modules", ".git", "dist"],
    "maxFileSize": 1048576,
    "chunkSize": 1500
  },
  "graph": {
    "type": "sqlite",
    "maxDepth": 5
  },
  "embeddings": {
    "model": "Xenova/all-MiniLM-L6-v2",
    "batchSize": 32
  }
}
```

## Supported Languages

- TypeScript/JavaScript
- Python
- Go
- Rust
- Java
- C/C++
- And more...

## Performance

- **Indexing Speed**: ~10,000 files in 5 minutes
- **Query Response**: < 500ms average
- **Memory Usage**: < 500MB typical
- **Incremental Updates**: Real-time

## Troubleshooting

### Indexing Issues

If indexing fails:
1. Check available disk space
2. Verify file permissions
3. Check logs: `~/.codegraph/logs/`

### Performance Issues

For large codebases:
1. Increase worker threads
2. Adjust chunk size
3. Use `.codegraphignore`

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Project Structure

```
codegraph-mcp/
├── src/
│   ├── index.ts                 # MCP server entry
│   ├── core/                    # Core components
│   │   ├── auto-indexer.ts     # Auto-indexing
│   │   ├── indexer.ts          # Main indexer
│   │   ├── parser.ts           # AST parsing
│   │   ├── graph.ts            # Graph database
│   │   └── embeddings.ts       # Semantic embeddings
│   ├── handlers/                # MCP handlers
│   │   ├── tools.ts            # Tool implementations
│   │   ├── progressive-tools.ts # Progressive enhancement
│   │   └── resources.ts        # Resource handlers
│   ├── intelligence/            # Analysis modules
│   └── utils/                   # Utilities
├── tests/                       # Test suite
├── docs/                        # Documentation
└── package.json
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - See [LICENSE](LICENSE) for details.

## Acknowledgments

Built with:
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
- [Tree-sitter](https://tree-sitter.github.io)
- [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3)
- [Transformers.js](https://xenova.github.io/transformers.js/)

## Support

- Issues: [GitHub Issues](https://github.com/your-org/codegraph-mcp/issues)
- Discussions: [GitHub Discussions](https://github.com/your-org/codegraph-mcp/discussions)
- Documentation: [docs.codegraph.dev](https://docs.codegraph.dev)