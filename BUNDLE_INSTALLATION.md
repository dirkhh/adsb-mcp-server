# MCP Bundle Installation Guide

This guide explains how to install and use the ADS-B MCP Server bundle.

## What's Included

The `.mcpb` bundle contains:
- **readsb_mcp_server.py** - Main MCP server
- **shared_utils.py** - Shared utility functions
- **requirements.txt** - Python dependencies
- **setup_remote_config.py** - Claude Desktop configuration helper
- **test/** - Test scripts and utilities
- **Configuration files** - setup.cfg, pyproject.toml, .gitignore

## Installation Methods

### Method 1: Direct MCP Client Installation

1. **Download the bundle**: `adsb-mcp-server-v1.0.0.mcpb`
2. **Install via MCP client**: Use your MCP client's bundle installation feature
3. **Configure**: Set the `base_url` parameter to your readsb/Ultrafeeder instance

### Method 2: Manual Installation

1. **Extract the bundle**: Rename `.mcpb` to `.zip` and extract
2. **Install dependencies**: `pip install -r requirements.txt`
3. **Configure MCP client**: Add server configuration manually

## Configuration

### Basic Configuration

```json
{
  "mcpServers": {
    "adsb": {
      "command": "python",
      "args": ["readsb_mcp_server.py", "--base-url", "http://your-feeder:8080"],
      "env": {}
    }
  }
}
```

### Advanced Configuration

```json
{
  "mcpServers": {
    "adsb": {
      "command": "python",
      "args": ["readsb_mcp_server.py", "--base-url", "http://192.168.1.100:8080"],
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

## Available Tools

- **get_aircraft_data** - Get current aircraft positions and information
- **get_receiver_stats** - Get readsb receiver statistics and performance metrics
- **search_aircraft** - Search for specific aircraft by callsign, hex code, or flight number
- **get_range_statistics** - Get receiver range and coverage statistics
- **get_closest_aircraft** - Get the N closest aircraft to the feeder location
- **get_aircraft_by_direction** - Get aircraft in a specific direction from the feeder

## Features

- ✅ **Real-time aircraft tracking** from readsb/Ultrafeeder
- ✅ **Flight route information** via adsb.im API (optional)
- ✅ **Interactive map links** for each aircraft
- ✅ **Multiple search options** (callsign, hex, direction, distance)
- ✅ **Comprehensive statistics** and range information
- ✅ **Configurable filtering** by distance and altitude

## Troubleshooting

### Common Issues

1. **"No aircraft found"**
   - Check if your readsb/Ultrafeeder instance is running
   - Verify the `base_url` configuration
   - Ensure network connectivity

2. **"Route information not available"**
   - Route fetching requires internet connection
   - Set `include_routes: false` if offline
   - Check adsb.im API availability

3. **"Connection refused"**
   - Verify feeder URL and port
   - Check firewall settings
   - Ensure readsb is accessible

### Testing Connection

Use the included test scripts:
```bash
python test/test_remote_connection.py
python test/remote_mcp_client.py
```

## Support

For issues and questions:
- Check the README.md for detailed setup instructions
- Review the test scripts for usage examples
- Verify your readsb/Ultrafeeder configuration

## Version History

- **v1.0.0** - Initial release with all core features
  - Aircraft tracking and statistics
  - Route information integration
  - Map links and search capabilities
  - Comprehensive error handling
