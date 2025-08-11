# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CodeGraph MCP is a Model Context Protocol server that provides deep codebase intelligence through multi-layered analysis. It automatically indexes codebases and progressively unlocks capabilities as indexing progresses.

## Essential Commands

### Build & Development
```bash
npm run build        # Compile TypeScript to JavaScript
npm run dev          # Run in development mode with tsx
npm start            # Run the compiled server
npm run typecheck    # Type checking without emit
npm run lint         # Lint TypeScript files
```

### Testing
```bash
npm test             # Run all tests with Jest (ES modules enabled)

# Run a specific test file
NODE_OPTIONS='--experimental-vm-modules' jest tests/basic.test.ts

# Run tests matching a pattern
NODE_OPTIONS='--experimental-vm-modules' jest --testNamePattern="Parser"
```

## Architecture Overview

### Core System Design

The system implements a **progressive enhancement model** where capabilities unlock as indexing progresses through 5 phases:

1. **Phase 1 (Structural)**: AST parsing, function/class extraction
2. **Phase 2 (Graph)**: Dependency tracking, relationship building  
3. **Phase 3 (Semantic)**: Embedding generation, similarity search
4. **Phase 4 (Temporal)**: Git history analysis, evolution tracking
5. **Phase 5 (Query)**: Intent classification, intelligent routing

### Key Architectural Components

#### Auto-Indexing System (`src/core/auto-indexer.ts`)
- Automatically triggers when Claude Code starts (via MCP initialize)
- Manages 5-phase indexing with EventEmitter for status updates
- Tracks capabilities per phase with `getCapabilities()` method
- Broadcasts real-time progress through `StatusBroadcaster`

#### Intelligence Layers
The system uses multiple intelligence modules that build on each other:

- **Structural** (`src/intelligence/structural.ts`): Pattern detection, complexity analysis
- **Graph** (`src/core/graph.ts`): SQLite-based relationship storage with impact analysis
- **Semantic** (`src/intelligence/semantic.ts`): Hybrid search combining embeddings and text
- **Temporal** (`src/intelligence/temporal.ts`): Git integration for refactoring detection
- **Query** (`src/intelligence/query.ts`): Intent classification and strategy selection

#### Progressive Tool Handlers (`src/handlers/progressive-tools.ts`)
Tools check current capabilities and provide:
- Full functionality when indexed
- Graceful fallbacks when partially indexed
- Clear status messages about missing capabilities

### MCP Integration Points

The server exposes:
- **8 Tools**: Status checking, codebase analysis, impact analysis, architecture explanation
- **5 Resources**: Architecture overview, dependencies, hotspots, status, metrics

Tools progressively adapt based on indexing status, always providing value even with partial data.

### Database Schema

SQLite database (`codegraph.db`) with tables:
- `symbols`: Functions, classes, variables with file locations
- `relationships`: Calls, imports, extends relationships between symbols
- `embeddings`: Vector embeddings for semantic search
- `git_history`: Commit history and file evolution

### Multi-Language Support

Tree-sitter parsers for:
- JavaScript/TypeScript (`.js`, `.jsx`, `.ts`, `.tsx`)
- Python (`.py`)
- Go (`.go`)
- Rust (`.rs`)
- Java (`.java`)

Parser selection in `src/core/parser.ts` based on file extension.

## Critical Implementation Details

### Embedding System
- Uses `@xenova/transformers` for local embedding generation
- Model: `Xenova/all-MiniLM-L6-v2` 
- Fallback to text-based similarity when embeddings unavailable
- Truncates text to 512 chars for embedding generation

### Status Broadcasting
- Real-time updates via EventEmitter pattern
- Status includes: phase, progress percentage, capabilities, errors
- Integrates with MCP resources for client consumption

### File Watching
- Uses `chokidar` for detecting file changes
- Incremental updates for modified files
- Full re-index triggered on significant structural changes

## Known Issues & Workarounds

### Jest Configuration
Tests require ES modules experimental flag due to `@xenova/transformers`:
```bash
NODE_OPTIONS='--experimental-vm-modules' jest
```

### Embedding Model Initialization
The embedding model downloads on first run (~30MB). Errors during download fall back to text matching.

## MCP Server Configuration

Add to Claude Desktop config:
```json
"codegraph": {
  "command": "node",
  "args": ["/absolute/path/to/dist/index.js"],
  "env": {
    "CODEGRAPH_HOME": "/absolute/path/to/project",
    "CODEGRAPH_DB": "/absolute/path/to/db"
  }
}
```

## Repository Link

GitHub: https://github.com/chatcbdai/claude-codegraph-mcp