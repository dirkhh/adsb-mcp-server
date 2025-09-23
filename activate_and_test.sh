#!/bin/bash
# Quick activation and testing script for the MCP server

echo "MCP Server Quick Test"
echo "===================="

# Activate virtual environment
# shellcheck disable=SC1091
source venv/bin/activate

echo "Virtual environment activated"
echo "Available commands:"
echo "1. python test/test_remote_connection.py   - Basic connection test"
echo "2. python test/remote_mcp_client.py        - Interactive testing"
echo "3. python test/debug_mcp_server.py         - Debug connection issues"
echo "4. python setup_remote_config.py           - Configure Claude Desktop"
echo ""

# Keep the shell active with virtual environment
exec bash


