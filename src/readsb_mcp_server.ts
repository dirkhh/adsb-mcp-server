#!/usr/bin/env node
/**
 * MCP Server for readsb/Ultrafeeder APIs
 * Exposes aircraft tracking data and statistics from readsb running in Ultrafeeder container
 */

// Debug flag - set to true for extensive debug output, false for minimal logging
const debug_output = false;

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    InitializeRequestSchema,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const VERSION = packageJson.version;

// Configure logging to stderr to avoid interfering with stdio protocol
const logger = {
  info: (message: string) => console.error(`[INFO] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
  warning: (message: string) => console.error(`[WARNING] ${message}`),
  debug: (message: string) => {
    if (debug_output) {
      console.error(`[DEBUG] ${message}`);
    }
  },
};

interface Aircraft {
  flight?: string;
  hex?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number;
  gs?: number;
  track?: number;
  r_dst?: number;
}

interface AircraftData {
  aircraft: Aircraft[];
  now: number;
}

interface Stats {
  total: {
    messages: number;
    aircraft_with_pos: number;
  };
  last1min: {
    messages: number;
    aircraft_with_pos: number;
  };
  last15min?: {
    max_distance?: number;
  };
  cpu?: {
    load: string;
  };
}

interface Receiver {
  lat: number;
  lon: number;
  version: string;
}

interface RouteInfo {
  [callsign: string]: string;
}

class ReadsbMCPServer {
  private baseUrl: string;
  private apiBase: string;
  private jsonBase: string;
  private webBase: string;
  private server: Server;

  constructor(baseUrl: string = 'http://ultrafeeder') {
    logger.info(`Creating ReadsbMCPServer with baseUrl: ${baseUrl}`);
    this.baseUrl = baseUrl.replace(/\/$/, '');
    logger.debug(`Cleaned baseUrl: ${this.baseUrl}`);

    // Check if this is a remote URL (contains port) or local
    if (this.baseUrl.includes(':') && this.baseUrl.split('//')[1].includes(':')) {
      // Remote URL with explicit port - use that port for all endpoints
      this.apiBase = `${this.baseUrl}/data`;
      this.jsonBase = this.baseUrl;
      this.webBase = this.baseUrl;
      logger.debug(`Using remote URL mode - apiBase: ${this.apiBase}, jsonBase: ${this.jsonBase}, webBase: ${this.webBase}`);
    } else {
      // Local URL - use standard ports
      const apiPort = 80;
      const jsonPort = 30047;
      const webPort = 8080;
      this.apiBase = `${this.baseUrl}:${apiPort}/data`;
      this.jsonBase = `${this.baseUrl}:${jsonPort}`;
      this.webBase = `${this.baseUrl}:${webPort}`;
      logger.debug(`Using local URL mode - apiBase: ${this.apiBase}, jsonBase: ${this.jsonBase}, webBase: ${this.webBase}`);
    }

    logger.debug('Creating MCP Server instance...');
    this.server = new Server({
      name: 'adsb-mcp-server',
      version: VERSION,
    }, {
      capabilities: {
        resources: {},
        tools: {},
      },
    });
    logger.info('MCP Server instance created successfully');

    logger.debug('Setting up request handlers...');
    this.setupHandlers();
    logger.debug('Request handlers setup completed');
  }

  private setupHandlers() {
    logger.debug('Setting up MCP request handlers');

    // Initialize handler - required by MCP protocol
    this.server.setRequestHandler(InitializeRequestSchema, async (request) => {
      logger.info(`Received initialize request: ${JSON.stringify(request)}`);
      const response = {
        protocolVersion: '2025-06-18',
        capabilities: {
          resources: {
            subscribe: false,
            listChanged: false
          },
          tools: {
            listChanged: false
          },
          experimental: {},
        },
        serverInfo: {
          name: 'adsb-mcp-server',
          version: VERSION,
        },
      };
      logger.info(`Sending initialize response: ${JSON.stringify(response)}`);
      return response;
    });

    this.server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
      logger.debug(`Received list resources request: ${JSON.stringify(request)}`);
      const resources = [
        {
          uri: `${this.apiBase}/aircraft.json`,
          name: 'Aircraft Data',
          description: 'Current aircraft positions and data',
          mimeType: 'application/json',
        },
        {
          uri: `${this.apiBase}/stats.json`,
          name: 'Statistics',
          description: 'readsb receiver statistics',
          mimeType: 'application/json',
        },
        {
          uri: `${this.apiBase}/receiver.json`,
          name: 'Receiver Info',
          description: 'Receiver configuration and status',
          mimeType: 'application/json',
        },
        {
          uri: `${this.webBase}/data/aircraft.json`,
          name: 'TAR1090 Aircraft',
          description: 'Aircraft data from TAR1090 web interface',
          mimeType: 'application/json',
        },
      ];
      logger.debug(`Sending list resources response with ${resources.length} resources`);
      return { resources };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      logger.debug(`Received read resource request: ${JSON.stringify(request)}`);
      try {
        logger.debug(`Fetching resource from: ${request.params.uri}`);
        const response = await axios.get(request.params.uri, { timeout: 10000 });
        logger.debug(`Successfully fetched resource, response size: ${JSON.stringify(response.data).length} chars`);
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: 'application/json',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error(`Error reading resource ${request.params.uri}: ${error}`);
        throw error;
      }
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      logger.debug(`Received list tools request: ${JSON.stringify(request)}`);
      return {
        tools: [
          {
            name: 'get_aircraft_data',
            description: 'Get current aircraft positions and information',
            inputSchema: {
              type: 'object',
              properties: {
                format: {
                  type: 'string',
                  enum: ['json', 'summary'],
                  default: 'json',
                  description: "Output format: 'json' for raw data, 'summary' for human-readable",
                },
                filter_distance: {
                  type: 'number',
                  description: 'Filter aircraft within this distance (nautical miles)',
                },
                filter_altitude: {
                  type: 'object',
                  properties: {
                    min: { type: 'number' },
                    max: { type: 'number' },
                  },
                  description: 'Filter aircraft by altitude range (feet)',
                },
                include_routes: {
                  type: 'boolean',
                  default: true,
                  description: 'Include flight route information (requires internet connection)',
                },
              },
            },
          },
          {
            name: 'get_receiver_stats',
            description: 'Get readsb receiver statistics and performance metrics',
            inputSchema: {
              type: 'object',
              properties: {
                format: {
                  type: 'string',
                  enum: ['json', 'summary'],
                  default: 'summary',
                  description: 'Output format',
                },
              },
            },
          },
          {
            name: 'search_aircraft',
            description: 'Search for specific aircraft by callsign, hex code, or flight number',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query (callsign, hex code, or flight number)',
                },
                search_type: {
                  type: 'string',
                  enum: ['callsign', 'hex', 'flight', 'any'],
                  default: 'any',
                  description: 'Type of search to perform',
                },
                include_routes: {
                  type: 'boolean',
                  default: true,
                  description: 'Include flight route information (requires internet connection)',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_range_statistics',
            description: 'Get receiver range and coverage statistics',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_closest_aircraft',
            description: 'Get the N closest aircraft to the feeder location',
            inputSchema: {
              type: 'object',
              properties: {
                count: {
                  type: 'integer',
                  default: 5,
                  minimum: 1,
                  maximum: 50,
                  description: 'Number of closest aircraft to return (1-50)',
                },
                max_distance: {
                  type: 'number',
                  description: 'Maximum distance to consider (nautical miles)',
                },
                include_routes: {
                  type: 'boolean',
                  default: true,
                  description: 'Include flight route information (requires internet connection)',
                },
              },
            },
          },
          {
            name: 'get_aircraft_by_direction',
            description: 'Get aircraft in a specific direction from the feeder',
            inputSchema: {
              type: 'object',
              properties: {
                direction: {
                  type: 'string',
                  enum: [
                    'north',
                    'south',
                    'east',
                    'west',
                    'northeast',
                    'northwest',
                    'southeast',
                    'southwest',
                  ],
                  description: 'Direction to search for aircraft',
                },
                max_distance: {
                  type: 'number',
                  description: 'Maximum distance to consider (nautical miles)',
                },
                count: {
                  type: 'integer',
                  default: 10,
                  minimum: 1,
                  maximum: 50,
                  description: 'Maximum number of aircraft to return',
                },
                include_routes: {
                  type: 'boolean',
                  default: true,
                  description: 'Include flight route information (requires internet connection)',
                },
              },
              required: ['direction'],
            },
          },
        ],
      };
      logger.debug(`Sending list tools response with 6 tools`);
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      logger.debug(`Received call tool request: ${JSON.stringify(request)}`);
      try {
        const { name, arguments: args } = request.params;
        logger.debug(`Calling tool: ${name} with args: ${JSON.stringify(args)}`);

        switch (name) {
          case 'get_aircraft_data':
            return await this.getAircraftData(args);
          case 'get_receiver_stats':
            return await this.getReceiverStats(args);
          case 'search_aircraft':
            return await this.searchAircraft(args);
          case 'get_range_statistics':
            return await this.getRangeStatistics(args);
          case 'get_closest_aircraft':
            return await this.getClosestAircraft(args);
          case 'get_aircraft_by_direction':
            return await this.getAircraftByDirection(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error(`Error in tool ${request.params.name}: ${error}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error}`,
            },
          ],
        };
      }
    });
  }

  private async fetchJson(endpoint: string): Promise<any> {
    const url = `${this.apiBase}/${endpoint}`;
    const response = await axios.get(url, { timeout: 10000 });
    return response.data;
  }

  private async getRouteInfo(aircraftList: Aircraft[]): Promise<RouteInfo> {
    // Filter aircraft with valid callsigns and positions
    const planesData = aircraftList
      .filter((aircraft) => {
        const callsign = aircraft.flight?.trim();
        return callsign && aircraft.lat && aircraft.lon && callsign !== 'Unknown';
      })
      .map((aircraft) => ({
        callsign: aircraft.flight!.trim(),
        lat: aircraft.lat!,
        lng: aircraft.lon!,
      }));

    if (planesData.length === 0) {
      return {};
    }

    try {
      const response = await axios.post(
        'https://adsb.im/api/0/routeset',
        { planes: planesData },
        {
          headers: {
            'User-Agent': 'adsb-mcp-server',
            'Content-Type': 'application/json; charset=utf-8',
          },
          timeout: 10000,
        }
      );

      // Extract plausible routes
      const routeInfo: RouteInfo = {};
      for (const route of response.data) {
        if (route.plausible && route._airport_codes_iata) {
          routeInfo[route.callsign] = route._airport_codes_iata;
        }
      }

      return routeInfo;
    } catch (error) {
      logger.warning(`Failed to fetch route info: ${error}`);
      return {};
    }
  }

  private async getAircraftData(args: any) {
    const data: AircraftData = await this.fetchJson('aircraft.json');
    let aircraftList = data.aircraft || [];

    // Apply filters
    if (args.filter_distance) {
      const maxDist = args.filter_distance;
      aircraftList = aircraftList.filter((a) => (a.r_dst || 0) <= maxDist);
    }

    if (args.filter_altitude) {
      const altFilter = args.filter_altitude;
      const minAlt = altFilter.min || 0;
      const maxAlt = altFilter.max || 50000;
      aircraftList = aircraftList.filter((a) => {
        const alt = a.alt_baro || 0;
        return minAlt <= alt && alt <= maxAlt;
      });
    }

    const formatType = args.format || 'json';
    const includeRoutes = args.include_routes !== false;

    if (formatType === 'summary') {
      let routeInfo: RouteInfo = {};
      if (includeRoutes) {
        routeInfo = await this.getRouteInfo(aircraftList);
      }
      const summary = this.formatAircraftSummary(aircraftList, data, routeInfo);
      return {
        content: [
          {
            type: 'text',
            text: summary,
          },
        ],
      };
    } else {
      const filteredData = { ...data, aircraft: aircraftList };
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(filteredData, null, 2),
          },
        ],
      };
    }
  }

  private formatAircraftSummary(aircraftList: Aircraft[], fullData: AircraftData, routeInfo: RouteInfo = {}): string {
    const totalAircraft = aircraftList.length;
    const withPos = aircraftList.filter((a) => 'lat' in a && 'lon' in a).length;

    let summary = `Aircraft Summary (Updated: ${fullData.now || 'Unknown'})\n`;
    summary += `Total Aircraft: ${totalAircraft}\n`;
    summary += `With Position: ${withPos}\n\n`;

    if (aircraftList.length > 0) {
      summary += 'Recent Aircraft:\n';
      for (let i = 0; i < Math.min(aircraftList.length, 10); i++) {
        const aircraft = aircraftList[i];
        const callsign = aircraft.flight?.trim() || 'Unknown';
        const hexCode = aircraft.hex || 'Unknown';
        const altitude = aircraft.alt_baro || 'Unknown';
        const distance = aircraft.r_dst || 'Unknown';

        summary += `${(i + 1).toString().padStart(2)}. ${callsign.padEnd(8)} (${hexCode})\n`;

        // Add map link if hex code is available
        if (hexCode !== 'Unknown') {
          const mapLink = `${this.webBase}/?icao=${hexCode}`;
          summary += `     Map Link: ${mapLink}\n`;
        }

        // Add route information if available
        if (callsign in routeInfo) {
          summary += `     Route: ${routeInfo[callsign]}\n`;
        }

        summary += `     Alt: ${altitude} ft, Dist: ${distance} nm\n`;
      }

      if (totalAircraft > 10) {
        summary += `... and ${totalAircraft - 10} more aircraft\n`;
      }
    }

    return summary;
  }

  private async getReceiverStats(args: any) {
    const stats: Stats = await this.fetchJson('stats.json');
    const formatType = args.format || 'summary';

    if (formatType === 'summary') {
      const summary = this.formatStatsSummary(stats);
      return {
        content: [
          {
            type: 'text',
            text: summary,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    }
  }

  private formatStatsSummary(stats: Stats): string {
    const total = stats.total || {};
    const last1min = stats.last1min || {};

    let summary = 'Receiver Statistics\n';
    summary += '==================\n\n';

    if (total) {
      summary += `Total Messages: ${(total.messages || 0).toLocaleString()}\n`;
      summary += `Total Aircraft: ${(total.aircraft_with_pos || 0).toLocaleString()}\n`;
    }

    if (last1min) {
      summary += '\nLast Minute:\n';
      summary += `  Messages: ${(last1min.messages || 0).toLocaleString()}\n`;
      summary += `  Aircraft: ${(last1min.aircraft_with_pos || 0).toLocaleString()}\n`;
    }

    // Add CPU and memory if available
    if (stats.cpu) {
      summary += `\nSystem Load: ${stats.cpu.load || 'Unknown'}\n`;
    }

    return summary;
  }

  private async searchAircraft(args: any) {
    const query = args.query?.toString().toUpperCase().trim();

    // Validate query parameter
    if (!query) {
      return {
        content: [
          {
            type: 'text',
            text: 'Search query cannot be empty',
          },
        ],
      };
    }

    const searchType = args.search_type || 'any';

    // Validate search_type parameter
    const validSearchTypes = ['callsign', 'hex', 'flight', 'any'];
    if (!validSearchTypes.includes(searchType)) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid search_type '${searchType}'. Valid types are: ${validSearchTypes.join(', ')}`,
          },
        ],
      };
    }

    const data: AircraftData = await this.fetchJson('aircraft.json');
    const aircraftList = data.aircraft || [];

    const matches: Aircraft[] = [];
    for (const aircraft of aircraftList) {
      if (searchType === 'callsign' || searchType === 'any') {
        if (aircraft.flight?.toUpperCase().includes(query)) {
          matches.push(aircraft);
          continue;
        }
      }

      if (searchType === 'hex' || searchType === 'any') {
        if (aircraft.hex?.toUpperCase().includes(query)) {
          matches.push(aircraft);
          continue;
        }
      }

      if (searchType === 'flight' || searchType === 'any') {
        if (aircraft.flight?.toUpperCase().includes(query)) {
          matches.push(aircraft);
        }
      }
    }

    if (matches.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No aircraft found matching '${query}' with search type '${searchType}'`,
          },
        ],
      };
    }

    // Get route information for matches
    const includeRoutes = args.include_routes !== false;
    let routeInfo: RouteInfo = {};
    if (includeRoutes) {
      routeInfo = await this.getRouteInfo(matches);
    }

    let result = `Found ${matches.length} aircraft matching '${query}':\n\n`;
    for (const aircraft of matches) {
      const callsign = aircraft.flight?.trim() || 'Unknown';
      const hexCode = aircraft.hex || 'Unknown';
      const altitude = aircraft.alt_baro || 'Unknown';
      const lat = aircraft.lat || 'Unknown';
      const lon = aircraft.lon || 'Unknown';

      result += `Callsign: ${callsign}\n`;
      result += `Hex: ${hexCode}\n`;

      // Add map link if hex code is available
      if (hexCode !== 'Unknown') {
        const mapLink = `${this.webBase}/?icao=${hexCode}`;
        result += `Map Link: ${mapLink}\n`;
      }

      // Add route information if available
      if (callsign in routeInfo) {
        result += `Route: ${routeInfo[callsign]}\n`;
      }

      result += `Altitude: ${altitude} ft\n`;
      result += `Position: ${lat}, ${lon}\n`;
      result += '-'.repeat(30) + '\n';
    }

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }

  private async getRangeStatistics(_args: any) {
    // Try to get receiver info which may contain range data
    const receiverData: Receiver = await this.fetchJson('receiver.json');
    const statsData: Stats = await this.fetchJson('stats.json');

    let summary = 'Range Statistics\n';
    summary += '================\n\n';

    // Extract range information from receiver data
    if (receiverData.lat && receiverData.lon) {
      summary += `Receiver Location: ${receiverData.lat.toFixed(4)}, ${receiverData.lon.toFixed(4)}\n`;
    }

    // Add statistics about ranges if available
    if (statsData.total && 'max_distance' in statsData.total) {
      const maxDist = (statsData.total as any).max_distance;
      summary += `Max Range: ${maxDist} meters or ${(maxDist * 0.000539957).toFixed(2)} nautical miles\n`;
    }

    if (statsData.last15min && statsData.last15min.max_distance) {
      const last15maxDist = statsData.last15min.max_distance;
      summary += `Last 15 Minutes Max Range: ${last15maxDist} meters or ${(last15maxDist * 0.000539957).toFixed(2)} nautical miles\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: summary,
        },
      ],
    };
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    // Convert to radians
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lon1Rad = (lon1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;
    const lon2Rad = (lon2 * Math.PI) / 180;

    // Haversine formula
    const dLat = lat2Rad - lat1Rad;
    const dLon = lon2Rad - lon1Rad;

    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.asin(Math.sqrt(a));

    // Earth radius in nautical miles
    const earthRadiusNm = 3440.065;
    return earthRadiusNm * c;
  }

  private calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    // Convert to radians
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lon1Rad = (lon1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;
    const lon2Rad = (lon2 * Math.PI) / 180;

    const dLon = lon2Rad - lon1Rad;

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

    let bearing = (Math.atan2(y, x) * 180) / Math.PI;
    bearing = (bearing + 360) % 360; // Normalize to 0-360

    return bearing;
  }

  private getDirectionRange(direction: string): [number, number] {
    const directionRanges: { [key: string]: [number, number] } = {
      north: [337.5, 22.5],
      northeast: [22.5, 67.5],
      east: [67.5, 112.5],
      southeast: [112.5, 157.5],
      south: [157.5, 202.5],
      southwest: [202.5, 247.5],
      west: [247.5, 292.5],
      northwest: [292.5, 337.5],
    };
    return directionRanges[direction] || [0, 360];
  }

  private async getClosestAircraft(args: any) {
    const count = args.count || 5;

    // Validate count parameter
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      return {
        content: [
          {
            type: 'text',
            text: 'Invalid count parameter. Must be an integer between 1 and 50',
          },
        ],
      };
    }

    const maxDistance = args.max_distance;
    const includeRoutes = args.include_routes !== false;

    // Get receiver location
    const receiverData: Receiver = await this.fetchJson('receiver.json');
    const feederLat = receiverData.lat;
    const feederLon = receiverData.lon;

    if (!feederLat || !feederLon) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Receiver location cannot be determined from feeder data',
          },
        ],
      };
    }

    // Get aircraft data
    const aircraftData: AircraftData = await this.fetchJson('aircraft.json');
    const aircraftList = aircraftData.aircraft || [];

    // Filter aircraft with positions and calculate distances
    const aircraftWithDistances: Array<[number, Aircraft]> = [];
    for (const aircraft of aircraftList) {
      if (aircraft.lat && aircraft.lon) {
        const distance = this.calculateDistance(feederLat, feederLon, aircraft.lat, aircraft.lon);

        // Apply max distance filter if specified
        if (maxDistance === undefined || distance <= maxDistance) {
          aircraftWithDistances.push([distance, aircraft]);
        }
      }
    }

    // Sort by distance and take the closest ones
    aircraftWithDistances.sort((a, b) => a[0] - b[0]);
    const closestAircraft = aircraftWithDistances.slice(0, count);

    if (closestAircraft.length === 0) {
      if (maxDistance) {
        return {
          content: [
            {
              type: 'text',
              text: `No aircraft found within ${maxDistance} nautical miles of the feeder`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: 'No aircraft found near the feeder at this time',
            },
          ],
        };
      }
    }

    // Get route information for closest aircraft
    let routeInfo: RouteInfo = {};
    if (includeRoutes) {
      const closestAircraftList = closestAircraft.map(([, aircraft]) => aircraft);
      routeInfo = await this.getRouteInfo(closestAircraftList);
    }

    // Format results
    let result = `Closest ${closestAircraft.length} aircraft to feeder (${feederLat.toFixed(4)}, ${feederLon.toFixed(4)}):\n\n`;

    for (let i = 0; i < closestAircraft.length; i++) {
      const [distance, aircraft] = closestAircraft[i];
      const callsign = aircraft.flight?.trim() || 'Unknown';
      const hexCode = aircraft.hex || 'Unknown';
      const altitude = aircraft.alt_baro || 'Unknown';
      const speed = aircraft.gs || 'Unknown';
      const track = aircraft.track || 'Unknown';
      const lat = aircraft.lat || 'Unknown';
      const lon = aircraft.lon || 'Unknown';

      result += `${i + 1}. ${callsign.padEnd(10)} (${hexCode})\n`;

      // Add map link if hex code is available
      if (hexCode !== 'Unknown') {
        const mapLink = `${this.webBase}/?icao=${hexCode}`;
        result += `   Map Link: ${mapLink}\n`;
      }

      // Add route information if available
      if (callsign in routeInfo) {
        result += `   Route: ${routeInfo[callsign]}\n`;
      }

      result += `   Distance: ${distance.toFixed(1)} nm\n`;
      result += `   Altitude: ${altitude} ft\n`;
      result += `   Speed: ${speed} kts\n`;
      result += `   Track: ${track}°\n`;
      result += `   Position: ${typeof lat === 'number' ? lat.toFixed(4) : lat}, ${typeof lon === 'number' ? lon.toFixed(4) : lon}\n`;
      result += '-'.repeat(50) + '\n';
    }

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }

  private async getAircraftByDirection(args: any) {
    const direction = args.direction?.toLowerCase();

    // Validate direction parameter
    const validDirections = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'];
    if (!validDirections.includes(direction)) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid direction '${direction}'. Valid directions are: ${validDirections.join(', ')}`,
          },
        ],
      };
    }

    const maxDistance = args.max_distance;
    const count = args.count || 10;
    const includeRoutes = args.include_routes !== false;

    // Validate count parameter
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      return {
        content: [
          {
            type: 'text',
            text: 'Invalid count parameter. Must be an integer between 1 and 50',
          },
        ],
      };
    }

    // Get receiver location
    const receiverData: Receiver = await this.fetchJson('receiver.json');
    const feederLat = receiverData.lat;
    const feederLon = receiverData.lon;

    if (!feederLat || !feederLon) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Receiver location cannot be determined from feeder data',
          },
        ],
      };
    }

    // Get direction bearing range
    const [minBearing, maxBearing] = this.getDirectionRange(direction);

    // Get aircraft data
    const aircraftData: AircraftData = await this.fetchJson('aircraft.json');
    const aircraftList = aircraftData.aircraft || [];

    // Filter aircraft by direction and distance
    const directionalAircraft: Array<[number, number, Aircraft]> = [];
    for (const aircraft of aircraftList) {
      if (aircraft.lat && aircraft.lon) {
        // Calculate bearing from feeder to aircraft
        const bearing = this.calculateBearing(feederLat, feederLon, aircraft.lat, aircraft.lon);

        // Check if aircraft is in the specified direction
        let inDirection: boolean;
        if (minBearing <= maxBearing) {
          inDirection = minBearing <= bearing && bearing <= maxBearing;
        } else {
          // Handle wraparound (e.g., north: 337.5-22.5)
          inDirection = bearing >= minBearing || bearing <= maxBearing;
        }

        if (inDirection) {
          const distance = this.calculateDistance(feederLat, feederLon, aircraft.lat, aircraft.lon);

          // Apply max distance filter if specified
          if (maxDistance === undefined || distance <= maxDistance) {
            directionalAircraft.push([distance, bearing, aircraft]);
          }
        }
      }
    }

    // Sort by distance and limit count
    directionalAircraft.sort((a, b) => a[0] - b[0]);
    const limitedAircraft = directionalAircraft.slice(0, count);

    if (limitedAircraft.length === 0) {
      if (maxDistance) {
        return {
          content: [
            {
              type: 'text',
              text: `No aircraft found to the ${direction} within ${maxDistance} nautical miles of the feeder`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `No aircraft found to the ${direction} of the feeder at this time`,
            },
          ],
        };
      }
    }

    // Get route information for directional aircraft
    let routeInfo: RouteInfo = {};
    if (includeRoutes) {
      const directionalAircraftList = limitedAircraft.map(([, , aircraft]) => aircraft);
      routeInfo = await this.getRouteInfo(directionalAircraftList);
    }

    // Format results
    let result = `Aircraft to the ${direction} of feeder (${feederLat.toFixed(4)}, ${feederLon.toFixed(4)}):\n\n`;
    result += `Found ${limitedAircraft.length} aircraft\n\n`;

    for (let i = 0; i < limitedAircraft.length; i++) {
      const [distance, bearing, aircraft] = limitedAircraft[i];
      const callsign = aircraft.flight?.trim() || 'Unknown';
      const hexCode = aircraft.hex || 'Unknown';
      const altitude = aircraft.alt_baro || 'Unknown';
      const speed = aircraft.gs || 'Unknown';
      const track = aircraft.track || 'Unknown';
      const lat = aircraft.lat || 'Unknown';
      const lon = aircraft.lon || 'Unknown';

      result += `${i + 1}. ${callsign.padEnd(10)} (${hexCode})\n`;

      // Add map link if hex code is available
      if (hexCode !== 'Unknown') {
        const mapLink = `${this.webBase}/?icao=${hexCode}`;
        result += `   Map Link: ${mapLink}\n`;
      }

      // Add route information if available
      if (callsign in routeInfo) {
        result += `   Route: ${routeInfo[callsign]}\n`;
      }

      result += `   Distance: ${distance.toFixed(1)} nm\n`;
      result += `   Bearing: ${bearing.toFixed(1)}°\n`;
      result += `   Altitude: ${altitude} ft\n`;
      result += `   Speed: ${speed} kts\n`;
      result += `   Track: ${track}°\n`;
      result += `   Position: ${typeof lat === 'number' ? lat.toFixed(4) : lat}, ${typeof lon === 'number' ? lon.toFixed(4) : lon}\n`;
      result += '-'.repeat(50) + '\n';
    }

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }

  async run() {
    logger.info('Starting MCP server run() method');
    try {
      logger.debug('Creating StdioServerTransport...');
      const transport = new StdioServerTransport();
      logger.debug('Connecting server to transport...');
      await this.server.connect(transport);
      logger.debug('MCP server connected via stdio transport');

      // Keep the process alive
      logger.info('Server is running, waiting for requests...');
      await new Promise(() => {}); // Keep alive indefinitely
    } catch (error) {
      logger.error(`Error in server run(): ${error}`);
      throw error;
    }
  }

  async testMode() {
    logger.info('Starting MCP server in test mode');

    // Test the endpoints first
    try {
      logger.info('Testing readsb endpoints...');

      // Test aircraft data
      const aircraftData: AircraftData = await this.fetchJson('aircraft.json');
      const aircraftCount = (aircraftData.aircraft || []).length;
      logger.info(`Aircraft endpoint OK - ${aircraftCount} aircraft found`);

      // Test stats
      const statsData: Stats = await this.fetchJson('stats.json');
      const totalMessages = statsData.total?.messages || 0;
      logger.info(`Stats endpoint OK - ${totalMessages.toLocaleString()} total messages`);

      // Test receiver info
      const receiverData: Receiver = await this.fetchJson('receiver.json');
      logger.info(`Receiver endpoint OK - Version: ${receiverData.version || 'Unknown'}`);
    } catch (error) {
      logger.error(`Endpoint test failed: ${error}`);
      logger.info('Server will still run, but endpoints may not work');
    }

    logger.info('MCP server is ready and waiting for connections...');
    logger.info('Use Ctrl+C to stop the server');

    // Keep the server running
    try {
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 30000)); // Check every 30 seconds
        logger.info('MCP server still running...');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info('Server stopped by user');
      } else {
        throw error;
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  let baseUrl = 'http://localhost';
  let testMode = false;

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base-url' && i + 1 < args.length) {
      baseUrl = args[i + 1];
      i++;
    } else if (args[i] === '--test') {
      testMode = true;
    }
  }

  logger.debug(`parsed args: baseUrl=${baseUrl}, testMode=${testMode}`);

  const server = new ReadsbMCPServer(baseUrl);
  logger.debug('created server');

  if (testMode) {
    // In test mode, we don't run the server transport, just create the server
    // and let the test client interact with it directly via stdin/stdout
    logger.debug('MCP server connected via stdio');
  } else {
    logger.debug('Starting MCP server in stdio mode...');
    await server.run();
    logger.debug('MCP server run() completed');
  }
  logger.debug('server finished');
}

// Check if this file is being run directly (not imported)
// Handle URL encoding differences between import.meta.url and process.argv[1]
const currentFileUrl = import.meta.url.replace(/%20/g, ' ');
const scriptPath = process.argv[1];
const isMainModule = currentFileUrl === `file://${scriptPath}` ||
                     currentFileUrl.endsWith(scriptPath) ||
                     currentFileUrl.includes(scriptPath.replace(/\\/g, '/'));

if (isMainModule) {
  logger.info('Starting MCP server main process...');
  main().catch((error) => {
    logger.error(`Server error: ${error}`);
    logger.error(`Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
    process.exit(1);
  });
} else {
  logger.debug(`scriptPath: ${scriptPath}`);
  logger.debug(`currentFileUrl: ${currentFileUrl}`);
  logger.debug('Importing MCP server as a module...');
}
