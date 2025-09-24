# ADS-B MCP Server

A Model Context Protocol (MCP) server that exposes the data of a typical ADS-B feeder instance for use from within Claude (and possibly other LLMs).

This was initially written in order to provide an MCP server connected to the <a href="https://github.com/dirkhh/adsb-feeder-image">ADS-B Feeder Image</a> running an Ultrafeeder container - but it will work with any feeder that is providing the APIs typically associated with readsb / tar1090.

## Features

This MCP server so far provides access to:

- **Aircraft Data**: Real-time aircraft positions, callsigns, altitudes, and tracking information
- **Receiver Statistics**: Performance metrics, message counts, and system status
- **Search Functionality**: Find specific aircraft by callsign, hex code, or flight number
- **Range Statistics**: Coverage area and signal range information

## Installation

### Prerequisites
- Python 3.10 or higher
- Access to an ADS-B feeder

### Install Dependencies
```bash
# Clone the repository
git clone <repository-url>
cd adsb-mcp-server

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Either install production dependencies
pip install -r requirements.txt

# or the development dependencies (which include production dependencies)
pip install -r requirements-dev.txt
```

# MCP Client Setup Guide

This guide will help you connect various MCP clients to your ADS-B MCP server.

## Prerequisites

1. **Running ADS-B Feeder**: Make sure your ADS-B feeder is running and accessible - the easiest way to do that may be running the ADS-B Feeder Image
2. **Python MCP Server**: The readsb MCP server should be working
3. **Network Access**: Client needs access to your feeder's API endpoints

## Option 1: Claude Desktop (Recommended)

### Step 1: Find Claude Desktop Config File

**macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```bash
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**
```bash
~/.config/claude/claude_desktop_config.json
```

### Step 2: Add ADS-B MCP Server

Add this configuration to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "readsb": {
      "command": "python",
      "args": [
        "/PATH/TO/adsb-mcp-server/readsb_mcp_server.py",
        "--base-url",
        "http://adsb-feeder.local"
      ],
      "env": {},
      "disabled": false,
      "autoApprove": [
        "get_aircraft_data",
        "get_receiver_stats",
        "search_aircraft",
        "get_range_statistics",
        "get_closest_aircraft",
        "get_aircraft_by_direction"
      ]
    }
  }
}
```

### Step 3: Restart Claude Desktop

Close and reopen Claude Desktop to load the new configuration. Unfortunately at this point Claude doesn't have an option to reload its configuration.

### Step 4: Test the Connection

In Claude Desktop, try asking:
- "What are the 5 closest planes to my feeder?"
- "Show me aircraft to the east of my location"

## Option 2: MCP Inspector

### Install MCP Inspector

```bash
npm install -g @modelcontextprotocol/inspector
```

### Run with ADS-B MCP server

```bash
npx @modelcontextprotocol/inspector python /PATH/TO/adsb-mcp-server/readsb_mcp_server.py --base-url http://adsb-feeder.local
```

This will open a web interface where you can test the MCP server tools.

## Creating MCP Bundles

You can create an MCP Bundle (`.mcpb` file) for easy distribution using the official MCPB tool:

```bash
# Install the official MCPB tool (Node.js required)
npm install -g @anthropic-ai/mcpb

# Update version from git tag (optional)
python update_version.py

# Create bundle using official tool
mcpb pack .
```

The bundle will be created as `adsb-mcp-server.mcpb` and can be distributed and installed in MCP-compatible clients. The bundle includes all Python dependencies for self-contained operation.

## Option 3: Custom Python Client

Use the included simple MCP client:

```bash
cd MCP
python test/remote_mcp_client.py
```

This provides an interactive command-line interface to test all the MCP tools.

## Option 4: Test Script

Run the basic connection test:

```bash
cd MCP
python test/test_remote_connection.py
```

This will verify that the ADS-B MCP server is working correctly.

## Configuration Options

### Base URL Configuration

Adjust the `--base-url` parameter based on your setup:

- **Typical ADS-B Feeder Image**: (by default `adsb-feeder.local` is used as host)
- **Feeder with known IP address** `--base-url http://192.168.123.45`
- **Local feeder running on this system**: `--base-url http://localhost`
- **Running in a container in the ADS-B Feeder Image adsb_im_bridge Docker network**: `--base-url http://ultrafeeder`

### Port Configuration

The server connects to these readsb endpoints:
- Port 8080: REST API (`/data/aircraft.json`, `/data/stats.json`)

Make sure these ports are accessible from your MCP client. If your `tar1090` runs on a different port, adjust the command line accordingly, e.g. `--base-url http://100.99.98.97:6543`

## Troubleshooting

### Connection Issues

1. **Check if you can manually get to the ADS-B data:**
   ```bash
   curl http://adsb-feeder.local:8080/data/aircraft.json
   ```

### Claude configuration issues

1. **Check the Claude MCP logs:**

e.g., `~/Library/Logs/Claude/mcp-server-readsb.log` on macOS

### Performance Issues

1. **Limit result counts** to avoid overwhelming responses
2. **Use distance filters** to reduce data processing
3. **Monitor memory usage** for large aircraft datasets

## Example Queries

Once connected, you can ask natural language questions like:

- "What are the 5 closest aircraft to my feeder?"
- "Show me all planes to the east within 50 miles"
- "Are there any aircraft to the north?"
- "What's the closest plane to the south?"
- "Find aircraft in the northeast quadrant"
- "Search for flight UAL123"
- "Show me receiver statistics"

## Advanced Configuration

### Custom Auto-Approval

Configure which tools require approval:

```json
{
  "autoApprove": [
    "get_aircraft_data",
    "get_receiver_stats"
  ]
}
```

Tools not in autoApprove will require manual approval in Claude Desktop.

## Support

If you encounter issues:

- Reach out in the #adsb-dot-im channel on the <a href="https://discord.gg/7buWAFA28H">SDR Enthusiasts Discord</a>

## License

This project contains some AI generated code (with potentially questionable IP issues); overall the project is licensed under the GPLv3.
