import * as readline from 'readline';

/**
 * Get the remote host and port from the user with sensible defaults
 */
export async function getRemoteHostAndPort(): Promise<{ host: string; port: number }> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Enter the IP address or hostname of your ADS-B feeder (default is adsb-feeder.local): ', (host) => {
      const remoteHost = host.trim() || 'adsb-feeder.local';

      rl.question('Enter the port (default 8080): ', (port) => {
        const remotePort = port.trim() ? parseInt(port.trim(), 10) : 8080;

        rl.close();
        resolve({ host: remoteHost, port: remotePort });
      });
    });
  });
}
