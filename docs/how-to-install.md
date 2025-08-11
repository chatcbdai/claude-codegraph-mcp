# Claude CodeGraph MCP Installation Guide

## Prerequisites

Before installing Claude CodeGraph MCP, ensure you have:

1. **Node.js 18+** installed
2. **Claude Desktop** application (latest version)
3. **Git** for cloning the repository
4. At least **2GB of free disk space** for dependencies and indexing data

## Installation Methods

### Method 1: Quick Install (Recommended)

1. **Clone the repository**
   ```bash
   git clone https://github.com/chatcbdai/claude-codegraph-mcp.git
   cd claude-codegraph-mcp
   ```

2. **Run the installation script**
   ```bash
   chmod +x install.sh
   ./install.sh
   ```

3. **Configure Claude Desktop**
   
   The install script will automatically add the configuration to Claude Desktop. If it doesn't work, follow the manual configuration below.

### Method 2: Manual Installation

1. **Clone and build the project**
   ```bash
   git clone https://github.com/chatcbdai/claude-codegraph-mcp.git
   cd claude-codegraph-mcp
   npm install
   npm run build
   ```

2. **Configure Claude Desktop**

   Open your Claude Desktop configuration file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

3. **Add the MCP server configuration**

   Add this to your `mcpServers` section:

   ```json
   {
     "mcpServers": {
       "codegraph": {
         "command": "node",
         "args": ["/absolute/path/to/claude-codegraph-mcp/dist/index.js"],
         "env": {
           "NODE_ENV": "production"
         }
       }
     }
   }
   ```

   **Important**: Replace `/absolute/path/to/claude-codegraph-mcp` with the actual path where you cloned the repository.

4. **Restart Claude Desktop**

   Completely quit and restart Claude Desktop for the changes to take effect.

## IDE and Editor Integration

### VS Code Integration

Claude CodeGraph MCP automatically detects VS Code workspaces when Claude Code is launched from the VS Code terminal.

1. **Install Claude Code extension** (if not already installed)
2. **Open your project** in VS Code
3. **Open the integrated terminal** (Terminal ’ New Terminal)
4. **Launch Claude Code** from the terminal:
   ```bash
   claude
   ```

The MCP will automatically detect your workspace and begin indexing.

### JetBrains IDEs (IntelliJ, WebStorm, PyCharm)

1. **Open your project** in your JetBrains IDE
2. **Open the terminal** (View ’ Tool Windows ’ Terminal)
3. **Launch Claude Code**:
   ```bash
   claude
   ```

### Vim/Neovim Integration

1. **Navigate to your project directory**
2. **Launch Claude Code**:
   ```bash
   cd /path/to/your/project
   claude
   ```

## Automatic Project Detection

Claude CodeGraph MCP automatically detects and indexes your project when:

1. **Launched from a project directory** with any of these files:
   - `package.json` (Node.js)
   - `requirements.txt` or `pyproject.toml` (Python)
   - `go.mod` (Go)
   - `Cargo.toml` (Rust)
   - `.git` (any Git repository)

2. **VS Code environment variables** are present
3. **Explicit paths** are provided in tool calls

## Verifying Installation

After installation, verify that CodeGraph is working:

1. **Start Claude Desktop**
2. **Open Claude Code** in your project directory
3. **Use a CodeGraph command**:
   ```
   Use the get_indexing_status tool to check CodeGraph status
   ```

You should see a response showing the indexing progress or completion status.

## Configuration Options

### Environment Variables

You can customize CodeGraph behavior with environment variables:

```json
{
  "mcpServers": {
    "codegraph": {
      "command": "node",
      "args": ["/path/to/codegraph/dist/index.js"],
      "env": {
        "CODEGRAPH_MAX_FILES": "10000",        // Maximum files to index
        "CODEGRAPH_IGNORE_PATTERNS": "*.log",   // Additional ignore patterns
        "CODEGRAPH_INDEX_DEPTH": "10",          // Directory traversal depth
        "CODEGRAPH_ENABLE_GIT": "true",         // Enable git history analysis
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Database Location

CodeGraph stores project-specific databases in:
- **macOS/Linux**: `~/.codegraph/projects/`
- **Windows**: `%USERPROFILE%\.codegraph\projects\`

Each project gets its own database based on the project path hash.

## Troubleshooting

### MCP Not Detected

If Claude Code doesn't detect CodeGraph:

1. **Check the configuration path** is absolute, not relative
2. **Verify Node.js version**: `node --version` (must be 18+)
3. **Check the build**: Run `npm run build` in the CodeGraph directory
4. **Restart Claude Desktop** completely (not just reload)

### Indexing Issues

If indexing doesn't start automatically:

1. **Check project indicators** (package.json, .git, etc.)
2. **Use explicit path**: Ask Claude to "analyze codebase at /path/to/project"
3. **Check permissions**: Ensure read access to project files

### Performance Issues

For large codebases:

1. **Increase memory allocation**:
   ```json
   "env": {
     "NODE_OPTIONS": "--max-old-space-size=4096"
   }
   ```

2. **Limit indexing scope**:
   ```json
   "env": {
     "CODEGRAPH_MAX_FILES": "5000"
   }
   ```

## Updating CodeGraph

To update to the latest version:

```bash
cd /path/to/claude-codegraph-mcp
git pull origin main
npm install
npm run build
```

Then restart Claude Desktop.

## Uninstalling

To remove CodeGraph:

1. **Remove from Claude Desktop config**
   
   Delete the `codegraph` entry from `mcpServers` in your configuration file.

2. **Remove the repository**
   ```bash
   rm -rf /path/to/claude-codegraph-mcp
   ```

3. **Clean up databases** (optional)
   ```bash
   rm -rf ~/.codegraph
   ```

## Getting Help

- **GitHub Issues**: [Report bugs or request features](https://github.com/chatcbdai/claude-codegraph-mcp/issues)
- **Documentation**: Check the [README](../README.md) for detailed features
- **Logs**: Check Claude Desktop logs for MCP errors

## Next Steps

Once installed, CodeGraph will automatically:

1. **Index your codebase** when you open a project
2. **Track file changes** in real-time
3. **Build relationships** between code components
4. **Enable intelligent code analysis** through MCP tools

Try these commands in Claude Code:
- "Analyze the architecture of this codebase"
- "Find where X is implemented"
- "Show me the impact of changing function Y"
- "Explain the dependency graph"