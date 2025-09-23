#!/usr/bin/env python3
"""
Interactive command-line client for testing the MCP server
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


class RemoteMCPClient:
    def __init__(self, remote_host: str, remote_port: int = 8080):
        self.remote_host = remote_host
        self.remote_port = remote_port
        self.base_url = f"http://{remote_host}:{remote_port}"
        self.server_process = None
        self.request_id = 1

    def start_server(self):
        """Start the MCP server process"""
        server_path = Path(__file__).parent.parent / "readsb_mcp_server.py"

        self.server_process = subprocess.Popen(
            [sys.executable, server_path, "--base-url", self.base_url],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if not self.server_process or not self.server_process.stdin or not self.server_process.stdout:
            raise RuntimeError("Failed to start MCP server process")

        # Initialize the server
        init_request = {
            "jsonrpc": "2.0",
            "id": self.request_id,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"roots": {"listChanged": True}, "sampling": {}},
                "clientInfo": {"name": "remote-client", "version": "1.0.0"},
            },
        }

        self.server_process.stdin.write(json.dumps(init_request) + "\n")
        self.server_process.stdin.flush()

        # Read initialization response
        response_line = self.server_process.stdout.readline()
        if response_line:
            response = json.loads(response_line)
            print(
                f"✅ Connected to MCP server: {response.get('result', {}).get('serverInfo', {}).get('name', 'Unknown')}"
            )

        # Send initialized notification
        initialized_notification = {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}
        self.server_process.stdin.write(json.dumps(initialized_notification) + "\n")
        self.server_process.stdin.flush()

        # Get available tools
        self.request_id += 1
        list_tools_request = {"jsonrpc": "2.0", "id": self.request_id, "method": "tools/list"}
        self.server_process.stdin.write(json.dumps(list_tools_request) + "\n")
        self.server_process.stdin.flush()

        tools_response = self.server_process.stdout.readline()
        if tools_response:
            tools_data = json.loads(tools_response)
            self.tools = [tool["name"] for tool in tools_data.get("result", {}).get("tools", [])]
            print(f"Available tools: {self.tools}")

    def send_request(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Send a request to the MCP server"""
        if not self.server_process or not self.server_process.stdin or not self.server_process.stdout:
            raise RuntimeError("Server not started")

        self.request_id += 1
        request = {"jsonrpc": "2.0", "id": self.request_id, "method": method, "params": params}

        self.server_process.stdin.write(json.dumps(request) + "\n")
        self.server_process.stdin.flush()

        response_line = self.server_process.stdout.readline()
        if response_line:
            return json.loads(response_line)
        return {}

    def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Call a specific tool"""
        return self.send_request("tools/call", {"name": tool_name, "arguments": arguments})

    def stop_server(self):
        """Stop the MCP server process"""
        if self.server_process:
            self.server_process.terminate()
            self.server_process.wait()
            self.server_process = None

    def interactive_mode(self):
        """Run interactive command loop"""
        print("\nRemote readsb MCP Client")
        print("=" * 30)
        print(f"Connected to: {self.remote_host}:{self.remote_port}")
        print("\nAvailable commands:")
        print("1. get_closest_aircraft [count] [max_distance]")
        print("2. get_aircraft_by_direction <direction> [max_distance] [count]")
        print("3. get_aircraft_data [format] [filter_distance]")
        print("4. get_receiver_stats [format]")
        print("5. search_aircraft <query> [search_type]")
        print("6. get_range_statistics")
        print("7. quit")
        print()

        while True:
            try:
                command = input("Enter command: ").strip().split()
                if not command:
                    continue

                if command[0] == "quit":
                    break
                elif command[0] == "get_closest_aircraft":
                    count = int(command[1]) if len(command) > 1 else 5
                    max_distance = float(command[2]) if len(command) > 2 else None

                    args: Dict[str, Any] = {"count": count}
                    if max_distance:
                        args["max_distance"] = max_distance

                    response = self.call_tool("get_closest_aircraft", args)
                    self._print_response(response)

                elif command[0] == "get_aircraft_by_direction":
                    if len(command) < 2:
                        print("Usage: get_aircraft_by_direction <direction> [max_distance] [count]")
                        continue

                    direction = command[1]
                    max_distance = float(command[2]) if len(command) > 2 else None
                    count = int(command[3]) if len(command) > 3 else 10

                    args = {"direction": direction, "count": count}
                    if max_distance:
                        args["max_distance"] = max_distance

                    response = self.call_tool("get_aircraft_by_direction", args)
                    self._print_response(response)

                elif command[0] == "get_aircraft_data":
                    format_type = command[1] if len(command) > 1 else "summary"
                    filter_distance = float(command[2]) if len(command) > 2 else None

                    args = {"format": format_type}
                    if filter_distance:
                        args["filter_distance"] = str(filter_distance)

                    response = self.call_tool("get_aircraft_data", args)
                    self._print_response(response)

                elif command[0] == "get_receiver_stats":
                    format_type = command[1] if len(command) > 1 else "summary"
                    response = self.call_tool("get_receiver_stats", {"format": format_type})
                    self._print_response(response)

                elif command[0] == "search_aircraft":
                    if len(command) < 2:
                        print("Usage: search_aircraft <query> [search_type]")
                        continue

                    query = command[1]
                    search_type = command[2] if len(command) > 2 else "callsign"

                    response = self.call_tool("search_aircraft", {"query": query, "search_type": search_type})
                    self._print_response(response)

                elif command[0] == "get_range_statistics":
                    response = self.call_tool("get_range_statistics", {})
                    self._print_response(response)

                else:
                    print("Unknown command. Type 'quit' to exit.")

            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"Error: {e}")

    def _print_response(self, response: Dict[str, Any]):
        """Print formatted response"""
        if "result" in response:
            content = response["result"].get("content", [])
            if content and "text" in content[0]:
                print("\n" + "=" * 50)
                print(content[0]["text"])
                print("=" * 50 + "\n")
            else:
                print("Response received but no text content found")
        elif "error" in response:
            print(f"Error: {response['error']}")
        else:
            print("Unexpected response format")


def main():
    """Main entry point"""
    print("Remote readsb MCP Client")
    print("=" * 30)

    # Get connection details
    remote_host, remote_port = get_remote_host_and_port()

    # Create and start client
    client = RemoteMCPClient(remote_host, remote_port)

    try:
        client.start_server()
        client.interactive_mode()
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.stop_server()
        print("Disconnected.")


if __name__ == "__main__":
    main()
