#!/bin/bash
"""
Script to install the official MCPB tool for creating MCP bundles
"""

set -e

echo "Installing official MCPB tool..."
echo "================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "Please install Node.js first:"
    echo "  - macOS: brew install node"
    echo "  - Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  - Windows: Download from https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed!"
    echo "Please install npm first"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"

# Install MCPB tool globally
echo "Installing @anthropic-ai/mcpb globally..."
npm install -g @anthropic-ai/mcpb

# Verify installation
if command -v mcpb &> /dev/null; then
    echo "✅ MCPB tool installed successfully!"
    echo "✅ mcpb version: $(mcpb --version 2>/dev/null || echo 'installed')"
    echo ""
    echo "You can now create MCP bundles with:"
    echo "  mcpb build"
else
    echo "❌ MCPB tool installation failed!"
    exit 1
fi

echo ""
echo "Next steps:"
echo "1. Update version: python update_version.py"
echo "2. Create bundle: mcpb pack ."
echo "3. The bundle will be created as adsb-mcp-server.mcpb"
echo "   - Includes all Python dependencies for self-contained operation"
