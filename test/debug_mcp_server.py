#!/usr/bin/env python3
"""
Debugging tool for MCP server connection issues
"""

import asyncio
import json
import subprocess
import sys
import os
from pathlib import Path
from typing import Any, Dict

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from shared_utils import get_remote_host_and_port


def debug_connection(remote_host: str, remote_port: int = 8080):
    """Debug connection issues with detailed output"""

    print("MCP Server Debug Tool")
    print("=" * 30)
    print(f"Target: {remote_host}:{remote_port}")
    print()

    # Test 1: Basic network connectivity
    print("1. Testing basic network connectivity...")
    import socket

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        result = sock.connect_ex((remote_host, remote_port))
        sock.close()

        if result == 0:
            print("✅ Network connectivity: OK")
        else:
            print(f"❌ Network connectivity: FAILED (error code: {result})")
            print("   Check if the host is reachable and port is open")
            return
    except Exception as e:
        print(f"❌ Network connectivity: ERROR - {e}")
        return

    # Test 2: HTTP endpoint availability
    print("\n2. Testing HTTP endpoint availability...")
    import urllib.request

    try:
        url = f"http://{remote_host}:{remote_port}/data/aircraft.json"
        with urllib.request.urlopen(url, timeout=10) as response:
            if response.status == 200:
                print("✅ Aircraft endpoint: OK")
                data = json.loads(response.read().decode())
                aircraft_count = len(data.get("aircraft", []))
                print(f"   Found {aircraft_count} aircraft")
            else:
                print(f"❌ Aircraft endpoint: HTTP {response.status}")
    except Exception as e:
        print(f"❌ Aircraft endpoint: ERROR - {e}")

    try:
        url = f"http://{remote_host}:{remote_port}/data/stats.json"
        with urllib.request.urlopen(url, timeout=10) as response:
            if response.status == 200:
                print("✅ Stats endpoint: OK")
            else:
                print(f"❌ Stats endpoint: HTTP {response.status}")
    except Exception as e:
        print(f"❌ Stats endpoint: ERROR - {e}")

    # Test 3: MCP server startup
    print("\n3. Testing MCP server startup...")

    server_path = Path(__file__).parent.parent / "readsb_mcp_server.py"

    try:
        process = subprocess.Popen(
            [sys.executable, server_path, "--base-url", f"http://{remote_host}:{remote_port}"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if not process or not process.stdin or not process.stdout:
            raise RuntimeError("Failed to start MCP server process")

        # Send a simple request
        init_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"roots": {"listChanged": True}, "sampling": {}},
                "clientInfo": {"name": "debug-client", "version": "1.0.0"},
            },
        }

        process.stdin.write(json.dumps(init_request) + "\n")
        process.stdin.flush()

        # Read response with timeout
        import select

        if sys.platform != "win32":
            ready, _, _ = select.select([process.stdout], [], [], 5)
            if ready:
                response_line = process.stdout.readline()
                if response_line:
                    response = json.loads(response_line)
                    print("✅ MCP server startup: OK")
                    print(f"   Server name: {response.get('result', {}).get('serverInfo', {}).get('name', 'Unknown')}")
                else:
                    print("❌ MCP server startup: No response")
            else:
                print("❌ MCP server startup: Timeout")
        else:
            # Windows fallback
            response_line = process.stdout.readline()
            if response_line:
                response = json.loads(response_line)
                print("✅ MCP server startup: OK")
            else:
                print("❌ MCP server startup: No response")

        process.terminate()
        process.wait()

    except Exception as e:
        print(f"❌ MCP server startup: ERROR - {e}")

    print("\nDebug completed. Check the results above for any issues.")


def get_remote_host_and_port():
    """Get the remote host and port from the user"""
    remote_host = (
        input("Enter the IP address or hostname of your ADS-B feeder (default is adsb-feeder.local): ").strip()
        or "adsb-feeder.local"
    )
    remote_port = (
        int(input("Enter the port (default 8080): ").strip())
        if input("Enter the port (default 8080): ").strip()
        else 8080
    )
    return remote_host, remote_port


def main():
    """Main entry point"""
    if len(sys.argv) > 1:
        remote_host = sys.argv[1]
        remote_port = int(sys.argv[2]) if len(sys.argv) > 2 else 8080
    else:
        remote_host, remote_port = get_remote_host_and_port()

    debug_connection(remote_host, remote_port)


if __name__ == "__main__":
    main()
