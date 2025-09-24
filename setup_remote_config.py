#!/usr/bin/env python3
"""
Setup script to create Claude Desktop configuration for remote readsb/Ultrafeeder
"""

import json
import os
import sys
from pathlib import Path

from shared_utils import get_remote_host_and_port


def find_claude_config_path():
    """Find the Claude Desktop configuration file path"""
    system = sys.platform

    if system == "darwin":  # macOS
        config_path = Path.home() / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json"
    elif system == "win32":  # Windows
        config_path = Path(os.environ["APPDATA"]) / "Claude" / "claude_desktop_config.json"
    else:  # Linux
        config_path = Path.home() / ".config" / "claude" / "claude_desktop_config.json"

    return config_path


def create_remote_config(remote_host: str, remote_port: int = 8080):
    """Create Claude Desktop configuration for remote readsb"""

    # Get the current script directory to build the server path
    script_dir = Path(__file__).parent
    server_script = script_dir / "readsb_mcp_server.py"

    # Get the virtual environment Python path
    venv_python = script_dir / "venv" / "bin" / "python"

    config = {
        "mcpServers": {
            "readsb": {
                "command": "uv",
                "args": ["run", "python", str(server_script), "--base-url", f"http://{remote_host}:{remote_port}"],
                "env": {},
                "disabled": False,
                "autoApprove": [
                    "get_aircraft_data",
                    "get_receiver_stats",
                    "search_aircraft",
                    "get_range_statistics",
                    "get_closest_aircraft",
                    "get_aircraft_by_direction",
                ],
            }
        }
    }

    return config


def main():
    """Main setup function"""
    print("Claude Desktop Remote readsb Configuration Setup")
    print("=" * 50)

    # Get remote host from user
    remote_host, remote_port = get_remote_host_and_port()

    print(f"\nCreating configuration for {remote_host}:{remote_port}")

    # Create the configuration
    config = create_remote_config(remote_host, remote_port)

    # Find Claude config path
    config_path = find_claude_config_path()

    print(f"\nClaude Desktop config location: {config_path}")

    # Create directory if it doesn't exist
    config_path.parent.mkdir(parents=True, exist_ok=True)

    # Check if config already exists
    if config_path.exists():
        print(f"\nWarning: Configuration file already exists at {config_path}")
        overwrite = input("Do you want to overwrite it? (y/N): ").strip().lower()
        if overwrite != "y":
            print("Configuration not updated.")
            return

        # Try to merge with existing config
        try:
            with open(config_path, "r") as f:
                existing_config = json.load(f)

            # Merge the configurations
            if "mcpServers" in existing_config:
                existing_config["mcpServers"]["readsb"] = config["mcpServers"]["readsb"]
            else:
                existing_config["mcpServers"] = config["mcpServers"]

            config = existing_config
            print("Merged with existing configuration")

        except json.JSONDecodeError:
            print("Warning: Could not parse existing config, will overwrite")

    # Write the configuration
    try:
        with open(config_path, "w") as f:
            json.dump(config, f, indent=2)

        print(f"\n✅ Configuration saved to {config_path}")
        print("\nNext steps:")
        print("1. Restart Claude Desktop")
        print("2. Test the connection by asking: 'What are the 5 closest planes to my feeder?'")
        print("\nConfiguration:")
        print(json.dumps(config, indent=2))

    except Exception as e:
        print(f"Error saving configuration: {e}")
        print(f"Please manually create the file at {config_path}")


def test_connection():
    """Test the connection before setting up Claude"""
    print("\n" + "=" * 50)
    print("Testing connection first...")
    print("=" * 50)

    remote_host, remote_port = get_remote_host_and_port()

    # Import and run the test
    try:
        import asyncio
        from test import test_remote_connection

        asyncio.run(test_remote_connection.test_remote_mcp_server(remote_host, remote_port))
    except ImportError:
        print("Could not import test script. Please run test_remote_connection.py separately.")
    except Exception as e:
        print(f"Test failed: {e}")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        test_connection()
    else:
        main()
