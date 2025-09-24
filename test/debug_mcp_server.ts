#!/usr/bin/env node
/**
 * Debugging tool for MCP server connection issues
 */

import { spawn } from 'child_process';
import * as http from 'http';
import * as net from 'net';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getRemoteHostAndPort } from '../src/shared_utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function debugConnection(remoteHost: string, remotePort: number = 8080): Promise<void> {
  console.log('MCP Server Debug Tool');
  console.log('='.repeat(30));
  console.log(`Target: ${remoteHost}:${remotePort}`);
  console.log();

  // Test 1: Basic network connectivity
  console.log('1. Testing basic network connectivity...');
  try {
    const socket = new net.Socket();
    const connectPromise = new Promise<void>((resolve, reject) => {
      socket.setTimeout(5000);
      socket.connect(remotePort, remoteHost, () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', reject);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });
    });

    await connectPromise;
    console.log('✅ Network connectivity: OK');
  } catch (error) {
    console.log(`❌ Network connectivity: FAILED - ${error}`);
    console.log('   Check if the host is reachable and port is open');
    return;
  }

  // Test 2: HTTP endpoint availability
  console.log('\n2. Testing HTTP endpoint availability...');

  // Test aircraft endpoint
  try {
    const aircraftUrl = `http://${remoteHost}:${remotePort}/data/aircraft.json`;
    const aircraftResponse = await new Promise<any>((resolve, reject) => {
      const req = http.get(aircraftUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            resolve({ status: res.statusCode, data: jsonData });
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${error}`));
          }
        });
      });
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.on('error', reject);
    });

    if (aircraftResponse.status === 200) {
      console.log('✅ Aircraft endpoint: OK');
      const aircraftCount = aircraftResponse.data.aircraft?.length || 0;
      console.log(`   Found ${aircraftCount} aircraft`);
    } else {
      console.log(`❌ Aircraft endpoint: HTTP ${aircraftResponse.status}`);
    }
  } catch (error) {
    console.log(`❌ Aircraft endpoint: ERROR - ${error}`);
  }

  // Test stats endpoint
  try {
    const statsUrl = `http://${remoteHost}:${remotePort}/data/stats.json`;
    const statsResponse = await new Promise<any>((resolve, reject) => {
      const req = http.get(statsUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            resolve({ status: res.statusCode, data: jsonData });
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${error}`));
          }
        });
      });
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.on('error', reject);
    });

    if (statsResponse.status === 200) {
      console.log('✅ Stats endpoint: OK');
    } else {
      console.log(`❌ Stats endpoint: HTTP ${statsResponse.status}`);
    }
  } catch (error) {
    console.log(`❌ Stats endpoint: ERROR - ${error}`);
  }

  // Test 3: MCP server startup
  console.log('\n3. Testing MCP server startup...');

  const serverPath = path.join(__dirname, '..', 'readsb_mcp_server.js');

  try {
    const process = spawn('node', [serverPath, '--base-url', `http://${remoteHost}:${remotePort}`], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.join(__dirname, '..'),
    });

    if (!process.stdin || !process.stdout) {
      throw new Error('Failed to start MCP server process');
    }

    // Send a simple request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { roots: { listChanged: true }, sampling: {} },
        clientInfo: { name: 'debug-client', version: '1.0.0' },
      },
    };

    process.stdin.write(JSON.stringify(initRequest) + '\n');

    // Read response with timeout
    const responsePromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Response timeout')), 5000);

      process.stdout.once('data', (data: Buffer) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(data.toString());
          resolve(response);
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${error}`));
        }
      });
    });

    try {
      const response = await responsePromise;
      console.log('✅ MCP server startup: OK');
      console.log(`   Server name: ${response.result?.serverInfo?.name || 'Unknown'}`);
    } catch (error) {
      console.log(`❌ MCP server startup: ${error}`);
    }

    process.kill();

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      process.on('exit', () => resolve());
      setTimeout(resolve, 1000); // Fallback timeout
    });

  } catch (error) {
    console.log(`❌ MCP server startup: ERROR - ${error}`);
  }

  console.log('\nDebug completed. Check the results above for any issues.');
}

async function main(): Promise<void> {
  let remoteHost: string;
  let remotePort: number;

  if (process.argv.length > 2) {
    remoteHost = process.argv[2];
    remotePort = process.argv[3] ? parseInt(process.argv[3], 10) : 8080;
  } else {
    const { host, port } = await getRemoteHostAndPort();
    remoteHost = host;
    remotePort = port;
  }

  await debugConnection(remoteHost, remotePort);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Error: ${error}`);
    process.exit(1);
  });
}
