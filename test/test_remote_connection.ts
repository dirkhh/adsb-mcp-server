#!/usr/bin/env node
/**
 * Basic connection test for remote readsb/Ultrafeeder
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getRemoteHostAndPort } from '../src/shared_utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function testRemoteMcpServer(remoteHost: string, remotePort: number = 8080): Promise<void> {
  console.log('Remote readsb MCP Server Test');
  console.log('='.repeat(30));

  const baseUrl = `http://${remoteHost}:${remotePort}`;
  console.log(`Testing connection to: ${baseUrl}`);

  // Build the server script path
  const serverPath = path.join(__dirname, '..', 'readsb_mcp_server.js');

  console.log('Starting MCP server process...');

  // Start the server process
  const serverProcess = spawn('node', [serverPath, '--base-url', baseUrl], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: path.join(__dirname, '..'),
  });

  if (!serverProcess.stdin || !serverProcess.stdout || !serverProcess.stderr) {
    throw new Error('Failed to start MCP server process');
  }

  // Set up process handling
  let serverReady = false;
  let testCompleted = false;

  serverProcess.stderr.on('data', (data) => {
    const message = data.toString();
    console.log(`[SERVER] ${message.trim()}`);

    if (message.includes('MCP server connected via stdio')) {
      serverReady = true;
      console.log('✅ Server is ready');
    }
  });

  serverProcess.on('error', (error) => {
    console.error(`❌ Server process error: ${error}`);
    if (!testCompleted) {
      process.exit(1);
    }
  });

  serverProcess.on('exit', (code) => {
    console.log(`Server process exited with code: ${code}`);
    if (!testCompleted && code !== 0) {
      console.error('❌ Server exited unexpectedly');
      process.exit(1);
    }
  });

  // Wait for server to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Server startup timeout'));
    }, 10000);

    const checkReady = () => {
      if (serverReady) {
        clearTimeout(timeout);
        resolve();
      } else {
        setTimeout(checkReady, 100);
      }
    };
    checkReady();
  });

  console.log('Testing MCP protocol communication...');

  // Test 1: Initialize
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: { roots: { listChanged: true }, sampling: {} },
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
  };

  console.log('Sending initialize request...');
  serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');

  // Read initialization response
  const initResponse = await new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Initialize timeout')), 5000);

    serverProcess.stdout.once('data', (data) => {
      clearTimeout(timeout);
      try {
        const response = JSON.parse(data.toString());
        resolve(response);
      } catch (error) {
        reject(new Error(`Invalid JSON response: ${error}`));
      }
    });
  });

  if (initResponse.result) {
    console.log('✅ Initialize successful');
    console.log(`   Server: ${initResponse.result.serverInfo?.name || 'Unknown'}`);
  } else {
    console.error('❌ Initialize failed:', initResponse.error);
    throw new Error('Initialize failed');
  }

  // Send initialized notification
  const initializedNotification = {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  };
  serverProcess.stdin.write(JSON.stringify(initializedNotification) + '\n');

  // Test 2: List tools
  const listToolsRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
  };

  console.log('Sending list tools request...');
  serverProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');

  const toolsResponse = await new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('List tools timeout')), 5000);

    serverProcess.stdout.once('data', (data) => {
      clearTimeout(timeout);
      try {
        const response = JSON.parse(data.toString());
        resolve(response);
      } catch (error) {
        reject(new Error(`Invalid JSON response: ${error}`));
      }
    });
  });

  if (toolsResponse.result) {
    const tools = toolsResponse.result.tools || [];
    console.log(`✅ List tools successful - Found ${tools.length} tools`);
    console.log('   Available tools:', tools.map((t: any) => t.name).join(', '));
  } else {
    console.error('❌ List tools failed:', toolsResponse.error);
    throw new Error('List tools failed');
  }

  // Test 3: Call a simple tool
  const statsRequest = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'get_receiver_stats',
      arguments: { format: 'summary' },
    },
  };

  console.log('Sending get_receiver_stats request...');
  serverProcess.stdin.write(JSON.stringify(statsRequest) + '\n');

  const statsResponse = await new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Get stats timeout')), 10000);

    serverProcess.stdout.once('data', (data) => {
      clearTimeout(timeout);
      try {
        const response = JSON.parse(data.toString());
        resolve(response);
      } catch (error) {
        reject(new Error(`Invalid JSON response: ${error}`));
      }
    });
  });

  if (statsResponse.result) {
    console.log('✅ Get receiver stats successful');
    console.log('   Response received with content');
  } else {
    console.error('❌ Get receiver stats failed:', statsResponse.error);
    throw new Error('Get receiver stats failed');
  }

  console.log('\n🎉 All tests passed! MCP server is working correctly.');
  console.log('✅ Remote connection established');
  console.log('✅ MCP protocol communication working');
  console.log('✅ Tool calls successful');

  testCompleted = true;

  // Clean up
  serverProcess.kill();

  // Wait for process to exit
  await new Promise<void>((resolve) => {
    serverProcess.on('exit', () => resolve());
    setTimeout(resolve, 1000); // Fallback timeout
  });
}

async function main(): Promise<void> {
  try {
    // Get connection details
    const { host: remoteHost, port: remotePort } = await getRemoteHostAndPort();

    // Run the test
    await testRemoteMcpServer(remoteHost, remotePort);
  } catch (error) {
    console.error(`Test failed: ${error}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
