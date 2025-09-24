#!/usr/bin/env node
/**
 * Setup script to create Claude Desktop configuration for remote readsb/Ultrafeeder
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getRemoteHostAndPort } from './shared_utils.js';

function findClaudeConfigPath(): string {
  const system = process.platform;

  if (system === 'darwin') {
    // macOS
    return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else if (system === 'win32') {
    // Windows
    const appData = process.env.APPDATA || '';
    return path.join(appData, 'Claude', 'claude_desktop_config.json');
  } else {
    // Linux
    return path.join(os.homedir(), '.config', 'claude', 'claude_desktop_config.json');
  }
}

function createRemoteConfig(remoteHost: string, remotePort: number = 8080) {
  // Get the current script directory to build the server path
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const serverScript = path.join(scriptDir, 'readsb_mcp_server.js');

  const config = {
    mcpServers: {
      readsb: {
        command: 'node',
        args: [serverScript, '--base-url', `http://${remoteHost}:${remotePort}`],
        env: {},
        disabled: false,
        autoApprove: [
          'get_aircraft_data',
          'get_receiver_stats',
          'search_aircraft',
          'get_range_statistics',
          'get_closest_aircraft',
          'get_aircraft_by_direction',
        ],
      },
    },
  };

  return config;
}

async function main() {
  console.log('Claude Desktop Remote readsb Configuration Setup');
  console.log('='.repeat(50));

  // Get remote host from user
  const { host: remoteHost, port: remotePort } = await getRemoteHostAndPort();

  console.log(`\nCreating configuration for ${remoteHost}:${remotePort}`);

  // Create the configuration
  const config = createRemoteConfig(remoteHost, remotePort);

  // Find Claude config path
  const configPath = findClaudeConfigPath();

  console.log(`\nClaude Desktop config location: ${configPath}`);

  // Create directory if it doesn't exist
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Check if config already exists
  if (fs.existsSync(configPath)) {
    console.log(`\nWarning: Configuration file already exists at ${configPath}`);
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const overwrite = await new Promise<string>((resolve) => {
      rl.question('Do you want to overwrite it? (y/N): ', resolve);
    });
    rl.close();

    if (overwrite.toLowerCase() !== 'y') {
      console.log('Configuration not updated.');
      return;
    }

    // Try to merge with existing config
    try {
      const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      // Merge the configurations
      if (existingConfig.mcpServers) {
        existingConfig.mcpServers.readsb = config.mcpServers.readsb;
      } else {
        existingConfig.mcpServers = config.mcpServers;
      }

      Object.assign(config, existingConfig);
      console.log('Merged with existing configuration');
    } catch (error) {
      console.log('Warning: Could not parse existing config, will overwrite');
    }
  }

  // Write the configuration
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log(`\n✅ Configuration saved to ${configPath}`);
    console.log('\nNext steps:');
    console.log('1. Restart Claude Desktop');
    console.log('2. Test the connection by asking: "What are the 5 closest planes to my feeder?"');
    console.log('\nConfiguration:');
    console.log(JSON.stringify(config, null, 2));
  } catch (error) {
    console.log(`Error saving configuration: ${error}`);
    console.log(`Please manually create the file at ${configPath}`);
  }
}

async function testConnection() {
  console.log('\n' + '='.repeat(50));
  console.log('Testing connection first...');
  console.log('='.repeat(50));

  const { host: remoteHost, port: remotePort } = await getRemoteHostAndPort();

  // Import and run the test
  try {
    const { testRemoteMcpServer } = await import('../test/test_remote_connection.js');
    await testRemoteMcpServer(remoteHost, remotePort);
  } catch (error) {
    console.log('Could not import test script. Please run test_remote_connection.ts separately.');
    console.log(`Test failed: ${error}`);
  }
}

if (process.argv.length > 2 && process.argv[2] === 'test') {
  testConnection();
} else {
  main().catch((error) => {
    console.error(`Error: ${error}`);
    process.exit(1);
  });
}
