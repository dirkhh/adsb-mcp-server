#!/bin/bash
# Launch MCP Inspector for remote readsb testing

echo "MCP Inspector Launch Script for Remote readsb"
echo "============================================="

# Check if MCP Inspector is installed
if ! command -v npx &> /dev/null; then
    echo "Error: npx is not installed. Please install Node.js first."
    exit 1
fi

# Get remote host from user
read -r -p "Enter the IP address or hostname of your ADS-B feeder (default is adsb-feeder.local): " REMOTE_HOST
if [ -z "$REMOTE_HOST" ]; then
    REMOTE_HOST="adsb-feeder.local"
    echo "Using default host: $REMOTE_HOST"
fi

# Get port (default to 8080)
read -r -p "Enter the port (default 8080): " REMOTE_PORT
REMOTE_PORT=${REMOTE_PORT:-8080}

echo "Launching MCP Inspector for $REMOTE_HOST:$REMOTE_PORT..."

# Launch MCP Inspector
npx @modelcontextprotocol/inspector python /Users/hohndel/src/adsb-feeder-image/MCP/readsb_mcp_server.py --base-url "http://$REMOTE_HOST:$REMOTE_PORT"

