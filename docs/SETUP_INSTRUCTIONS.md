# Setup Instructions for CodeGraph MCP

## Manual Configuration Required

Due to security restrictions, you need to manually edit the Claude Desktop configuration file.

### Step 1: Open the configuration file
```bash
open "/Users/chrisryviss/Library/Application Support/Claude/claude_desktop_config.json"
```

### Step 2: Add CodeGraph to mcpServers section

If the file already has an `mcpServers` section, add this entry to it:

```json
"codegraph": {
  "command": "node",
  "args": ["/Users/chrisryviss/claude-codegraph/dist/index.js"],
  "env": {
    "CODEGRAPH_HOME": "/Users/chrisryviss/claude-codegraph",
    "CODEGRAPH_DB": "/Users/chrisryviss/claude-codegraph/db"
  }
}
```

If the file doesn't have an `mcpServers` section, the complete file should look like:

```json
{
  "mcpServers": {
    "codegraph": {
      "command": "node",
      "args": ["/Users/chrisryviss/claude-codegraph/dist/index.js"],
      "env": {
        "CODEGRAPH_HOME": "/Users/chrisryviss/claude-codegraph",
        "CODEGRAPH_DB": "/Users/chrisryviss/claude-codegraph/db"
      }
    }
  }
}
```

### Step 3: Save and restart Claude Desktop

1. Save the file
2. Completely quit Claude Desktop (Cmd+Q)
3. Reopen Claude Desktop

### Step 4: Verify

Once restarted, the CodeGraph tools should be available in Claude Code.