#!/usr/bin/env python3
"""
Test script for connecting to remote readsb/Ultrafeeder MCP server
"""

import asyncio
import json
import subprocess
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from shared_utils import get_remote_host_and_port  # noqa: E402


async def test_remote_mcp_server(remote_host: str, remote_port: int = 8080):
    """Test the MCP server with remote readsb/Ultrafeeder"""

    print(f"Testing MCP Server Connection to {remote_host}:{remote_port}...")
    print("=" * 60)

    # Construct the base URL for the remote feeder
    base_url = f"http://{remote_host}:{remote_port}"

    # Start the MCP server process
    server_path = Path(__file__).parent.parent / "readsb_mcp_server.py"

    server_process = subprocess.Popen(
        [
            "uv",
            "run",
            "python",
            server_path,
            "--base-url",
            base_url,
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if not server_process or not server_process.stdin or not server_process.stdout:
        raise RuntimeError("Failed to start MCP server process")

    try:
        # Send initialization request
        init_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"roots": {"listChanged": True}, "sampling": {}},
                "clientInfo": {"name": "test-client", "version": "1.0.0"},
            },
        }

        print("Sending initialization request...")
        server_process.stdin.write(json.dumps(init_request) + "\n")
        server_process.stdin.flush()

        # Read initialization response
        response_line = server_process.stdout.readline()
        if response_line:
            response = json.loads(response_line)
            print(f"Initialization response: {response.get('result', {}).get('serverInfo', {}).get('name', 'Unknown')}")

        # Send initialized notification
        initialized_notification = {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}

        server_process.stdin.write(json.dumps(initialized_notification) + "\n")
        server_process.stdin.flush()

        # Test list tools
        list_tools_request = {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}

        print("Requesting tools list...")
        server_process.stdin.write(json.dumps(list_tools_request) + "\n")
        server_process.stdin.flush()

        tools_response = server_process.stdout.readline()
        if tools_response:
            tools_data = json.loads(tools_response)
            tools = tools_data.get("result", {}).get("tools", [])
            print(f"Available tools: {[tool['name'] for tool in tools]}")

        # Test receiver stats first (less likely to fail)
        print("\nTesting get_receiver_stats...")
        stats_request = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "get_receiver_stats", "arguments": {"format": "summary"}},
        }

        server_process.stdin.write(json.dumps(stats_request) + "\n")
        server_process.stdin.flush()

        stats_response = server_process.stdout.readline()
        if stats_response:
            stats_data = json.loads(stats_response)
            if "result" in stats_data:
                print("Receiver stats successful!")
                print(f"Response: {stats_data['result']['content'][0]['text']}")
            else:
                print(f"Receiver stats error: {stats_data.get('error', 'Unknown error')}")

        # Test aircraft data
        print("\nTesting get_closest_aircraft...")
        aircraft_request = {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {"name": "get_closest_aircraft", "arguments": {"count": 3}},
        }

        server_process.stdin.write(json.dumps(aircraft_request) + "\n")
        server_process.stdin.flush()

        aircraft_response = server_process.stdout.readline()
        if aircraft_response:
            aircraft_data = json.loads(aircraft_response)
            if "result" in aircraft_data:
                print("Aircraft data successful!")
                response_text = aircraft_data["result"]["content"][0]["text"]
                print(f"Response: {response_text[:300]}...")
            else:
                print(f"Aircraft data error: {aircraft_data.get('error', 'Unknown error')}")

        # Test directional query
        print("\nTesting get_aircraft_by_direction (east)...")
        direction_request = {
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": {"name": "get_aircraft_by_direction", "arguments": {"direction": "east", "count": 2}},
        }

        server_process.stdin.write(json.dumps(direction_request) + "\n")
        server_process.stdin.flush()

        direction_response = server_process.stdout.readline()
        if direction_response:
            direction_data = json.loads(direction_response)
            if "result" in direction_data:
                print("Directional query successful!")
                response_text = direction_data["result"]["content"][0]["text"]
                print(f"Response: {response_text[:300]}...")
            else:
                print(f"Directional query error: {direction_data.get('error', 'Unknown error')}")

    except Exception as e:
        print(f"Error during testing: {e}")
        print("This might indicate network connectivity issues or incorrect host/port")

    finally:
        # Clean up
        server_process.terminate()
        server_process.wait()
        print("\nMCP server test completed.")


def main():
    """Main entry point with user input"""
    print("Remote readsb MCP Server Test")
    print("=" * 30)

    # Get remote host and port from user
    remote_host, remote_port = get_remote_host_and_port()

    print(f"\nTesting connection to {remote_host}:{remote_port}")
    print("Make sure your readsb/Ultrafeeder is running and accessible")

    # Run the test
    asyncio.run(test_remote_mcp_server(remote_host, remote_port))


if __name__ == "__main__":
    main()
