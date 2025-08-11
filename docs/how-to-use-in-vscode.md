# Using Claude CodeGraph in VS Code

This guide shows you how to leverage CodeGraph's powerful codebase intelligence directly from VS Code's integrated terminal.

## Prerequisites

1. **Claude Desktop** installed and configured with CodeGraph MCP (see [installation guide](how-to-install.md))
2. **VS Code** installed
3. **Claude Code CLI** accessible via the `claude` command

## Quick Start (30 seconds)

1. **Open your project** in VS Code
2. **Open the integrated terminal** (`Terminal` ’ `New Terminal` or `Ctrl+` `)
3. **Launch Claude Code**:
   ```bash
   claude
   ```
4. CodeGraph automatically detects your VS Code workspace and begins indexing

## Step-by-Step Usage Guide

### Step 1: Launch Claude Code in Your Project

From VS Code's integrated terminal:
```bash
claude
```

You'll see Claude Code start with CodeGraph automatically detecting your workspace:
```
Welcome to Claude Code
[CodeGraph] Detected VS Code workspace folder: /path/to/your/project
[CodeGraph] Starting indexing...
```

### Step 2: Check Indexing Status

Immediately after launch, check CodeGraph's progress:
```
Use the get_indexing_status tool to show me the current indexing progress
```

You'll see real-time status like:
```
ó Indexing in Progress
[ˆˆˆˆˆˆˆˆ‘‘‘‘‘‘‘‘‘‘‘‘] 40%
Current Phase: Building relationships
Files Processed: 250/625
```

### Step 3: Start Using CodeGraph Tools

#### Find Code Implementations
```
Find where user authentication is implemented
```

#### Analyze Architecture
```
Explain the architecture of this codebase
```

#### Trace Execution Paths
```
Trace the execution flow from the main entry point
```

#### Analyze Impact
```
What's the impact of changing the UserModel class?
```

## Essential Commands for VS Code Users

### 1. Navigation & Discovery
```
"Find all React components in this project"
"Where are the API endpoints defined?"
"Show me all database models"
"Find the configuration files"
```

### 2. Understanding Code Flow
```
"Trace how a user login request is processed"
"What's the data flow for order processing?"
"Show me the call hierarchy for the payment function"
```

### 3. Refactoring Assistance
```
"What would break if I rename this function?"
"Show me all files that import UserService"
"Find unused exports in this module"
```

### 4. Architecture Analysis
```
"Identify the main modules and their relationships"
"What are the service boundaries in this project?"
"Show me the dependency graph for the auth module"
```

### 5. Code Quality
```
"What are the most complex functions?"
"Show me code hotspots that change frequently"
"Identify tightly coupled components"
```

## VS Code-Specific Features

### Automatic Workspace Detection

CodeGraph automatically detects your VS Code workspace through environment variables:
- `VSCODE_WORKSPACE_FOLDER` - Your workspace root
- `TERM_PROGRAM` - Identifies VS Code terminal
- `VSCODE_PID` - VS Code process ID

### Multi-Root Workspace Support

If you have multiple folders in your workspace:
```
"Analyze the codebase in the frontend folder"
"Find implementations across all workspace folders"
```

### Integration with VS Code Tasks

You can create VS Code tasks that use Claude Code:
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Analyze Architecture",
      "type": "shell",
      "command": "echo 'analyze_codebase' | claude",
      "problemMatcher": []
    }
  ]
}
```

## Progressive Intelligence

CodeGraph builds understanding in phases. Here's what's available at each stage:

| Time | Phase | Available Commands |
|------|-------|-------------------|
| 0-10s | Syntax | Find functions, classes, basic search |
| 10-30s | Graph | Trace calls, show dependencies |
| 30-60s | Semantic | Find by meaning, similar code |
| 1-2min | Temporal | Git history, change patterns |
| 2min+ | Full | All features with maximum intelligence |

## Tips for Maximum Productivity

### 1. Wait for Key Capabilities
For complex analysis, wait until graph relationships are ready:
```
Use wait_for_indexing to ensure graph analysis is complete
```

### 2. Use Natural Language
CodeGraph understands context:
```
"How does the shopping cart work?"
"What happens when a user clicks submit?"
```

### 3. Combine with File Editing
After finding code:
```
"Show me the implementation of processPayment"
[CodeGraph finds it]
"Now optimize this function for performance"
```

### 4. Leverage Git Integration
```
"What files changed in the last week?"
"Show me hotspots in the authentication module"
```

## Common VS Code Workflows

### Debugging Assistance
```
"Where is this error coming from: TypeError: Cannot read property 'user' of undefined"
"Trace the execution path that leads to the login function"
```

### Code Review
```
"Analyze the impact of the changes in the current branch"
"What are the dependencies of the modified files?"
```

### Documentation
```
"Generate documentation for the API endpoints"
"Explain how the middleware chain works"
```

### Testing
```
"What functions aren't covered by tests?"
"Show me the test files for UserService"
```

## Troubleshooting

### CodeGraph Not Detecting VS Code Workspace

If CodeGraph doesn't auto-detect your workspace:
```
"Use analyze_codebase tool with path /absolute/path/to/project"
```

### Indexing Taking Too Long

For large projects, you can:
1. Continue working with partial capabilities
2. Or wait for full indexing:
```
"Use wait_for_indexing with maxWaitTime 600"
```

### Tools Not Available

Check current capabilities:
```
"Use get_capabilities tool to show what's currently available"
```

## Keyboard Shortcuts in Claude Code

While in Claude Code session:
- `Ctrl+C` - Cancel current operation
- `Ctrl+D` - Exit Claude Code
- `Ctrl+L` - Clear screen

## Best Practices

1. **Start Claude Code at project root** for full codebase analysis
2. **Let initial indexing complete** for best results (usually < 1 minute)
3. **Use specific queries** for faster responses
4. **Check capabilities** if advanced features seem unavailable
5. **Leverage VS Code's file tree** - you can reference files you see in the explorer

## Example Session

```bash
# In VS Code terminal
$ claude

Welcome to Claude Code
[CodeGraph] Detected VS Code workspace: /Users/you/my-project
[CodeGraph] Starting indexing...

You: Check the indexing status
Claude: [Uses get_indexing_status tool]
 CodeGraph Ready - Indexing complete!
Available: Syntax, Graph, Semantic, Temporal, and Query intelligence

You: Find where user authentication is handled
Claude: [Uses find_implementation tool]
Found 3 main authentication implementations:
- `src/auth/LoginController.ts:42` - Main login handler
- `src/middleware/authMiddleware.ts:15` - JWT verification
- `src/services/AuthService.ts:28` - Authentication logic

You: What would break if I change the AuthService interface?
Claude: [Uses impact_analysis tool]
Impact Analysis for AuthService:
- Direct impact: 5 files
- Indirect impact: 12 files
- Critical paths: Login flow, API middleware, User dashboard
- Risk level: High

Would you like me to show the specific files affected?
```

## Next Steps

- Explore all [8 MCP tools](../README.md#available-tools-8) CodeGraph provides
- Check [example queries](../README.md#usage-examples) for inspiration
- Read about [progressive enhancement](../README.md#progressive-enhancement-model) to understand capabilities