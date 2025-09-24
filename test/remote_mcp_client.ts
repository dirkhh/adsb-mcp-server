#!/usr/bin/env node
/**
 * Interactive command-line client for testing the MCP server
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import { getRemoteHostAndPort } from '../src/shared_utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface McpResponse {
  result?: any;
  error?: any;
  id?: number;
}

class RemoteMCPClient {
  private remoteHost: string;
  private remotePort: number;
  private baseUrl: string;
  private serverProcess: any = null;
  private requestId = 1;
  private tools: string[] = [];

  constructor(remoteHost: string, remotePort: number = 8080) {
    this.remoteHost = remoteHost;
    this.remotePort = remotePort;
    this.baseUrl = `http://${remoteHost}:${remotePort}`;
  }

  async startServer(): Promise<void> {
    const serverPath = path.join(__dirname, '..', 'readsb_mcp_server.js');

    this.serverProcess = spawn('node', [serverPath, '--base-url', this.baseUrl], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.join(__dirname, '..'),
    });

    if (!this.serverProcess || !this.serverProcess.stdin || !this.serverProcess.stdout) {
      throw new Error('Failed to start MCP server process');
    }

    // Initialize the server
    const initRequest = {
      jsonrpc: '2.0',
      id: this.requestId,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { roots: { listChanged: true }, sampling: {} },
        clientInfo: { name: 'remote-client', version: '1.0.0' },
      },
    };

    this.serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');
    this.serverProcess.stdin.flush?.();

    // Read initialization response
    const initResponse = await this.readResponse();
    if (initResponse.result) {
      console.log(`✅ Connected to MCP server: ${initResponse.result.serverInfo?.name || 'Unknown'}`);
    }

    // Send initialized notification
    const initializedNotification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    };
    this.serverProcess.stdin.write(JSON.stringify(initializedNotification) + '\n');

    // Get available tools
    this.requestId++;
    const listToolsRequest = {
      jsonrpc: '2.0',
      id: this.requestId,
      method: 'tools/list',
    };
    this.serverProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');

    const toolsResponse = await this.readResponse();
    if (toolsResponse.result) {
      this.tools = toolsResponse.result.tools.map((tool: any) => tool.name);
      console.log(`Available tools: ${this.tools.join(', ')}`);
    }
  }

  private async readResponse(): Promise<McpResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Response timeout')), 10000);

      this.serverProcess.stdout.once('data', (data: Buffer) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(data.toString());
          resolve(response);
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${error}`));
        }
      });
    });
  }

  private async sendRequest(method: string, params: any): Promise<McpResponse> {
    if (!this.serverProcess || !this.serverProcess.stdin || !this.serverProcess.stdout) {
      throw new Error('Server not started');
    }

    this.requestId++;
    const request = {
      jsonrpc: '2.0',
      id: this.requestId,
      method,
      params,
    };

    this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
    return await this.readResponse();
  }

  async callTool(toolName: string, arguments_: any): Promise<McpResponse> {
    return await this.sendRequest('tools/call', { name: toolName, arguments: arguments_ });
  }

  stopServer(): void {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }

  async interactiveMode(): Promise<void> {
    console.log('\nRemote readsb MCP Client');
    console.log('='.repeat(30));
    console.log(`Connected to: ${this.remoteHost}:${this.remotePort}`);
    console.log('\nAvailable commands:');
    console.log('1. get_closest_aircraft [count] [max_distance]');
    console.log('2. get_aircraft_by_direction <direction> [max_distance] [count]');
    console.log('3. get_aircraft_data [format] [filter_distance]');
    console.log('4. get_receiver_stats [format]');
    console.log('5. search_aircraft <query> [search_type]');
    console.log('6. get_range_statistics');
    console.log('7. quit');
    console.log();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    while (true) {
      try {
        const command = await new Promise<string>((resolve) => {
          rl.question('Enter command: ', resolve);
        });

        const parts = command.trim().split(/\s+/);
        if (parts.length === 0 || parts[0] === '') continue;

        if (parts[0] === 'quit') {
          break;
        }

        let response: McpResponse;

        switch (parts[0]) {
          case 'get_closest_aircraft': {
            const count = parts[1] ? parseInt(parts[1], 10) : 5;
            const maxDistance = parts[2] ? parseFloat(parts[2]) : undefined;

            const args: any = { count };
            if (maxDistance) {
              args.max_distance = maxDistance;
            }

            response = await this.callTool('get_closest_aircraft', args);
            break;
          }

          case 'get_aircraft_by_direction': {
            if (parts.length < 2) {
              console.log('Usage: get_aircraft_by_direction <direction> [max_distance] [count]');
              continue;
            }

            const direction = parts[1];
            const maxDistance = parts[2] ? parseFloat(parts[2]) : undefined;
            const count = parts[3] ? parseInt(parts[3], 10) : 10;

            const args: any = { direction, count };
            if (maxDistance) {
              args.max_distance = maxDistance;
            }

            response = await this.callTool('get_aircraft_by_direction', args);
            break;
          }

          case 'get_aircraft_data': {
            const formatType = parts[1] || 'summary';
            const filterDistance = parts[2] ? parseFloat(parts[2]) : undefined;

            const args: any = { format: formatType };
            if (filterDistance) {
              args.filter_distance = filterDistance;
            }

            response = await this.callTool('get_aircraft_data', args);
            break;
          }

          case 'get_receiver_stats': {
            const formatType = parts[1] || 'summary';
            response = await this.callTool('get_receiver_stats', { format: formatType });
            break;
          }

          case 'search_aircraft': {
            if (parts.length < 2) {
              console.log('Usage: search_aircraft <query> [search_type]');
              continue;
            }

            const query = parts[1];
            const searchType = parts[2] || 'callsign';

            response = await this.callTool('search_aircraft', { query, search_type: searchType });
            break;
          }

          case 'get_range_statistics': {
            response = await this.callTool('get_range_statistics', {});
            break;
          }

          default:
            console.log("Unknown command. Type 'quit' to exit.");
            continue;
        }

        this.printResponse(response);
      } catch (error) {
        console.log(`Error: ${error}`);
      }
    }

    rl.close();
  }

  private printResponse(response: McpResponse): void {
    if (response.result) {
      const content = response.result.content || [];
      if (content.length > 0 && content[0].text) {
        console.log('\n' + '='.repeat(50));
        console.log(content[0].text);
        console.log('='.repeat(50) + '\n');
      } else {
        console.log('Response received but no text content found');
      }
    } else if (response.error) {
      console.log(`Error: ${JSON.stringify(response.error)}`);
    } else {
      console.log('Unexpected response format');
    }
  }
}

async function main(): Promise<void> {
  console.log('Remote readsb MCP Client');
  console.log('='.repeat(30));

  // Get connection details
  const { host: remoteHost, port: remotePort } = await getRemoteHostAndPort();

  // Create and start client
  const client = new RemoteMCPClient(remoteHost, remotePort);

  try {
    await client.startServer();
    await client.interactiveMode();
  } catch (error) {
    console.error(`Error: ${error}`);
  } finally {
    client.stopServer();
    console.log('Disconnected.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Error: ${error}`);
    process.exit(1);
  });
}
