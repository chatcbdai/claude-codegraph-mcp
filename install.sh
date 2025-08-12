#!/bin/bash

# Claude CodeGraph MCP Installation Script

set -e

echo "========================================"
echo "  Claude CodeGraph MCP Installer"
echo "========================================"
echo ""

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js is not installed. Please install Node.js 18+ first."
        echo "   Visit: https://nodejs.org/"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
        exit 1
    fi
    echo "✅ Node.js $(node -v) found"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        echo "❌ npm is not installed."
        exit 1
    fi
    echo "✅ npm $(npm -v) found"
    
    # Check git
    if ! command -v git &> /dev/null; then
        echo "❌ Git is not installed. Please install Git first."
        exit 1
    fi
    echo "✅ Git found"
    
    echo ""
}

# Install CodeGraph
install_codegraph() {
    echo "Installing CodeGraph MCP Server..."
    
    # Determine installation directory
    INSTALL_DIR="$HOME/.codegraph-mcp"
    
    # Check if already installed
    if [ -d "$INSTALL_DIR" ]; then
        echo "⚠️  CodeGraph appears to be already installed at $INSTALL_DIR"
        read -p "Do you want to reinstall? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Installation cancelled."
            exit 0
        fi
        echo "Removing existing installation..."
        rm -rf "$INSTALL_DIR"
    fi
    
    # Clone repository (using current directory if it's the repo)
    if [ -f "package.json" ] && grep -q "codegraph-mcp" package.json; then
        echo "Installing from current directory..."
        cp -r . "$INSTALL_DIR"
    else
        echo "Cloning repository..."
        git clone https://github.com/your-org/codegraph-mcp.git "$INSTALL_DIR"
    fi
    
    cd "$INSTALL_DIR"
    
    # Install dependencies
    echo "Installing dependencies..."
    npm install
    
    # Build the project
    echo "Building project..."
    npm run build
    
    # Create database directory
    mkdir -p "$INSTALL_DIR/db"
    
    echo "✅ CodeGraph installed successfully!"
    echo ""
}

# Configure Claude Code
configure_claude() {
    echo "Configuring Claude Code..."
    
    # Find Claude Code config directory
    if [ -d "$HOME/Library/Application Support/Claude" ]; then
        # macOS
        CONFIG_DIR="$HOME/Library/Application Support/Claude"
    elif [ -d "$HOME/.config/claude" ]; then
        # Linux
        CONFIG_DIR="$HOME/.config/claude"
    elif [ -d "$APPDATA/Claude" ]; then
        # Windows (Git Bash)
        CONFIG_DIR="$APPDATA/Claude"
    else
        echo "⚠️  Could not find Claude Code configuration directory."
        echo "Please add the following to your Claude Code MCP configuration manually:"
        echo ""
        print_manual_config
        return
    fi
    
    # Create MCP config if it doesn't exist
    MCP_CONFIG="$CONFIG_DIR/mcp-servers.json"
    
    if [ ! -f "$MCP_CONFIG" ]; then
        echo "Creating MCP configuration..."
        cat > "$MCP_CONFIG" << EOF
{
  "mcpServers": {
    "codegraph": {
      "command": "node",
      "args": ["$HOME/.codegraph-mcp/dist/index.js"],
      "env": {
        "CODEGRAPH_HOME": "$HOME/.codegraph-mcp",
        "CODEGRAPH_DB": "$HOME/.codegraph-mcp/db"
      }
    }
  }
}
EOF
    else
        echo "⚠️  MCP configuration already exists at $MCP_CONFIG"
        echo "Please add the CodeGraph configuration manually:"
        echo ""
        print_manual_config
    fi
    
    echo "✅ Configuration complete!"
    echo ""
}

# Print manual configuration
print_manual_config() {
    cat << EOF
{
  "codegraph": {
    "command": "node",
    "args": ["$HOME/.codegraph-mcp/dist/index.js"],
    "env": {
      "CODEGRAPH_HOME": "$HOME/.codegraph-mcp",
      "CODEGRAPH_DB": "$HOME/.codegraph-mcp/db"
    }
  }
}
EOF
}

# Create shortcuts
create_shortcuts() {
    echo "Creating shortcuts..."
    
    # Create command-line tool
    cat > "$HOME/.codegraph-mcp/codegraph" << 'EOF'
#!/bin/bash
node "$HOME/.codegraph-mcp/dist/index.js" "$@"
EOF
    chmod +x "$HOME/.codegraph-mcp/codegraph"
    
    # Add to PATH if using bash or zsh
    if [ -f "$HOME/.bashrc" ]; then
        if ! grep -q "codegraph-mcp" "$HOME/.bashrc"; then
            echo 'export PATH="$HOME/.codegraph-mcp:$PATH"' >> "$HOME/.bashrc"
            echo "✅ Added to .bashrc"
        fi
    fi
    
    if [ -f "$HOME/.zshrc" ]; then
        if ! grep -q "codegraph-mcp" "$HOME/.zshrc"; then
            echo 'export PATH="$HOME/.codegraph-mcp:$PATH"' >> "$HOME/.zshrc"
            echo "✅ Added to .zshrc"
        fi
    fi
    
    echo ""
}

# Main installation flow
main() {
    check_prerequisites
    install_codegraph
    configure_claude
    create_shortcuts
    
    echo "========================================"
    echo "  Installation Complete! 🎉"
    echo "========================================"
    echo ""
    echo "Next steps:"
    echo "1. Restart Claude Code"
    echo "2. Open a project directory"
    echo "3. CodeGraph will automatically start indexing"
    echo ""
    echo "Available tools:"
    echo "- get_indexing_status"
    echo "- find_implementation"
    echo "- trace_execution"
    echo "- impact_analysis"
    echo "- explain_architecture"
    echo ""
    echo "For more information, visit:"
    echo "https://github.com/your-org/codegraph-mcp"
    echo ""
    
    # Reload shell if possible
    if [ -n "$BASH_VERSION" ]; then
        echo "Run 'source ~/.bashrc' to update your PATH"
    elif [ -n "$ZSH_VERSION" ]; then
        echo "Run 'source ~/.zshrc' to update your PATH"
    fi
}

# Run installation
main