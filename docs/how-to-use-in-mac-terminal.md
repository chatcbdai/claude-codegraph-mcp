# Using Claude CodeGraph in Mac Terminal

This guide shows you how to use CodeGraph's intelligent codebase analysis directly from your Mac's Terminal application.

## Prerequisites

1. **Claude Desktop** installed with CodeGraph MCP configured (see [installation guide](how-to-install.md))
2. **Terminal** or **iTerm2** on macOS
3. **Claude Code CLI** accessible via the `claude` command

## Quick Start (30 seconds)

1. **Open Terminal** (Cmd+Space, type "Terminal")
2. **Navigate to your project**:
   ```bash
   cd ~/Projects/my-app
   ```
3. **Launch Claude Code**:
   ```bash
   claude
   ```
4. CodeGraph automatically detects and indexes your project

## Step-by-Step Usage Guide

### Step 1: Navigate to Your Project

Open Terminal and navigate to your project directory:
```bash
# Example paths
cd ~/Documents/my-project
cd ~/Developer/web-app
cd /Users/yourname/Projects/api-server
```

### Step 2: Verify Project Detection

Ensure your directory contains project indicators that CodeGraph recognizes:
```bash
ls -la
```

Look for one of these files:
- `package.json` (Node.js/JavaScript)
- `requirements.txt` or `pyproject.toml` (Python)
- `go.mod` (Go)
- `Cargo.toml` (Rust)
- `.git` (Any Git repository)
- `pom.xml` (Java)

### Step 3: Launch Claude Code

```bash
claude
```

You'll see:
```
Welcome to Claude Code
[CodeGraph] Detected project directory: /Users/you/project (found package.json)
[CodeGraph] Starting indexing...
```

### Step 4: Verify CodeGraph is Active

Check that CodeGraph is indexing your project:
```
Use get_indexing_status tool
```

Expected response:
```
ó Indexing in Progress
[ˆˆˆˆˆˆˆˆ‘‘‘‘‘‘‘‘‘‘‘‘] 40%
Current Phase: Syntax Analysis
Files Processed: 150/375
```

## Essential Terminal Commands

### Before Launching Claude Code

```bash
# Check you're in the right directory
pwd

# See project structure
tree -L 2  # If tree is installed: brew install tree

# Quick file count
find . -type f -name "*.js" -o -name "*.py" -o -name "*.go" | wc -l

# Check git status
git status
```

### Inside Claude Code Session

Once Claude Code is running, you can use natural language or direct tool calls:

#### Direct Tool Usage
```
Use analyze_codebase tool
Use find_implementation tool with query "database connection"
Use impact_analysis tool for component "UserModel"
Use trace_execution tool with entryPoint "main"
```

#### Natural Language Queries
```
"What does this codebase do?"
"Find all API endpoints"
"Show me the database schema"
"What are the main entry points?"
```

## Mac Terminal Workflows

### 1. Project Discovery & Analysis

```bash
# Navigate to project
cd ~/Developer/my-project

# Launch Claude Code
claude

# In Claude Code:
"Give me a high-level overview of this codebase"
"What technologies and frameworks are used?"
"Show me the project structure"
```

### 2. Code Search & Navigation

```bash
# If you know the general location
cd ~/Projects/backend

claude

# Find specific implementations
"Where is email validation implemented?"
"Find all REST API endpoints"
"Show me database query functions"
```

### 3. Dependency Analysis

```bash
# At project root
claude

"What are the external dependencies?"
"Which files import the logger module?"
"Show me the dependency graph"
```

### 4. Git Integration

```bash
# Ensure you're in a git repository
git status

claude

"What files changed most frequently?"
"Show me code hotspots"
"What are the recent refactoring patterns?"
```

## Terminal-Specific Features

### Using Explicit Paths

If CodeGraph doesn't auto-detect your project:
```
Use analyze_codebase tool with path "/Users/yourname/specific/project/path"
```

### Multiple Project Analysis

Open multiple Terminal tabs/windows for different projects:

**Tab 1**: Frontend
```bash
cd ~/Projects/frontend
claude
```

**Tab 2**: Backend
```bash
cd ~/Projects/backend
claude
```

### Background Indexing

You can let CodeGraph index while you continue working:
```
"Start indexing and let me know when complete"
[Continue with other questions while indexing runs]
```

## Progressive Intelligence Timeline

| Time | Available Features | Example Commands |
|------|-------------------|------------------|
| 0-10s | Basic search | "Find function calculateTotal" |
| 10-30s | Relationships | "What calls calculateTotal?" |
| 30-60s | Semantic search | "Find payment processing logic" |
| 1-2min | Git analysis | "Show frequently modified files" |
| 2min+ | Full intelligence | "Analyze architectural patterns" |

## Advanced Terminal Usage

### Piping and Automation

Create shell scripts that interact with Claude Code:

```bash
#!/bin/bash
# analyze_project.sh
echo "Use analyze_codebase tool" | claude
```

### Using with tmux

For persistent sessions:
```bash
tmux new -s codeanalysis
cd ~/Projects/my-app
claude
# Ctrl+B, D to detach
# tmux attach -t codeanalysis to resume
```

### Directory Shortcuts

Add to your `~/.zshrc` or `~/.bash_profile`:
```bash
# Quick project analysis
analyze_project() {
    cd "$1" && claude
}

# Usage: analyze_project ~/Projects/my-app
```

## Common Use Cases

### 1. New Project Onboarding
```bash
cd ~/NewProject
claude

"Explain the architecture of this codebase"
"What are the main modules and their purposes?"
"Show me the API endpoints"
"Where should I start to understand this code?"
```

### 2. Debugging Support
```bash
claude

"Where is the error 'undefined is not a function' likely coming from?"
"Trace the execution path for user login"
"What functions interact with the database?"
```

### 3. Code Review Preparation
```bash
git checkout feature-branch
claude

"What's the impact of changes in this branch?"
"Show me all modified function dependencies"
"Are there any breaking changes?"
```

### 4. Documentation Generation
```bash
claude

"Document all public APIs in this project"
"Explain the data flow for order processing"
"Generate a README overview of the architecture"
```

## Troubleshooting

### CodeGraph Not Detecting Project

If you see "No indexing information available":

1. **Check current directory**:
   ```bash
   pwd
   ls -la
   ```

2. **Ensure project indicators exist**:
   ```bash
   # For Node.js projects
   ls package.json
   
   # For Python projects
   ls requirements.txt
   
   # For any git project
   git status
   ```

3. **Use explicit path**:
   ```
   Use analyze_codebase with path "/absolute/path/to/project"
   ```

### Indexing Performance

For large codebases on Mac:

1. **Check system resources**:
   ```bash
   # In another terminal
   top
   # or
   htop  # If installed: brew install htop
   ```

2. **Limit scope if needed**:
   ```
   "Focus analysis on the src directory only"
   ```

### Permission Issues

If CodeGraph can't read files:
```bash
# Check file permissions
ls -la

# If needed, ensure read permissions
chmod -R u+r .
```

## Tips for Mac Users

### 1. Use Spotlight for Quick Access
- Press Cmd+Space
- Type "Terminal"
- Press Enter
- Navigate to project and run `claude`

### 2. Terminal Profiles
Create a Terminal profile for development:
- Terminal ’ Preferences ’ Profiles
- Set starting directory to your projects folder
- Set window size for comfortable viewing

### 3. Keyboard Shortcuts
- **Cmd+T**: New tab (for multiple projects)
- **Cmd+K**: Clear terminal
- **Ctrl+C**: Stop current Claude Code operation
- **Ctrl+D**: Exit Claude Code

### 4. Use Oh My Zsh
For better terminal experience:
```bash
# Install Oh My Zsh
sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# Add alias to ~/.zshrc
alias analyze="claude"
```

## Example Mac Terminal Session

```bash
# Open Terminal
$ cd ~/Developer/react-dashboard
$ pwd
/Users/johndoe/Developer/react-dashboard

$ ls
README.md    package.json    src/    public/    node_modules/

$ claude
Welcome to Claude Code
[CodeGraph] Detected project directory: /Users/johndoe/Developer/react-dashboard (found package.json)
[CodeGraph] Starting indexing...

You: Check status
Claude: [Uses get_indexing_status]
 CodeGraph Ready
Indexing complete! Full intelligence available.
- Files indexed: 234
- Functions found: 567
- Classes found: 89
- Relationships mapped: 1,245

You: What's the main purpose of this application?
Claude: [Uses analyze_codebase]
This is a React-based admin dashboard application with:
- User authentication system
- Real-time data visualization
- REST API integration with backend services
- Role-based access control
- Responsive Material-UI components

Main modules:
- Auth (login, JWT handling)
- Dashboard (charts, metrics)
- Users (CRUD operations)
- Settings (configuration management)

You: Where do API calls happen?
Claude: [Uses find_implementation]
API calls are centralized in:
- `src/services/api.js:15` - Main API client setup
- `src/services/userService.js:8` - User-related API calls  
- `src/services/dataService.js:12` - Dashboard data fetching
- `src/utils/apiHelpers.js:5` - Request/response interceptors

You: What would break if I change the API client?
Claude: [Uses impact_analysis]
Changing the API client would impact:
- Direct: 12 service files
- Indirect: 34 components
- Critical paths: Authentication flow, Data fetching, Error handling
- Risk: High - Recommend thorough testing

You: exit
$ 
```

## Best Practices for Mac Terminal

1. **Always navigate to project root** before launching Claude Code
2. **Use absolute paths** when working with multiple projects
3. **Keep Terminal windows organized** - one project per tab/window
4. **Save common queries** as shell aliases or scripts
5. **Check indexing status** before complex queries
6. **Let indexing complete** for projects you'll analyze repeatedly

## Next Steps

- Review all [available tools](../README.md#mcp-integration)
- Try [example queries](../README.md#usage-examples)
- Learn about [progressive enhancement](../README.md#progressive-enhancement-model)
- Set up [VS Code integration](how-to-use-in-vscode.md) for IDE-based workflow