#!/usr/bin/env python3
"""
MCP Server for readsb/Ultrafeeder APIs
Exposes aircraft tracking data and statistics from readsb running in Ultrafeeder container
"""

import asyncio
import json
import logging
import sys
from typing import Any, Dict, List

import httpx
from mcp.server import Server
from mcp.server.lowlevel import NotificationOptions
from mcp.server.models import InitializationOptions
from mcp.types import Resource, TextContent, Tool
from pydantic import AnyUrl

# Configure logging to stderr to avoid interfering with stdio protocol
logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("readsb-mcp")
logger.info("starting MCP server")


class ReadsbMCPServer:
    def __init__(self, base_url: str = "http://ultrafeeder"):
        self.base_url = base_url.rstrip("/")

        # Check if this is a remote URL (contains port) or local
        if ":" in self.base_url.split("//")[-1]:
            # Remote URL with explicit port - use that port for all endpoints
            self.api_port = None  # Will use the port from base_url
            self.json_port = None
            self.web_port = None
            self.api_base = f"{self.base_url}/data"
            self.json_base = f"{self.base_url}"
            self.web_base = f"{self.base_url}"
        else:
            # Local URL - use standard ports
            self.api_port = 80  # readsb REST API port
            self.json_port = 30047  # JSON position output port
            self.web_port = 8080  # TAR1090 web interface port
            self.api_base = f"{self.base_url}:{self.api_port}/data"
            self.json_base = f"{self.base_url}:{self.json_port}"
            self.web_base = f"{self.base_url}:{self.web_port}"

        self.server = Server("readsb-mcp")
        self._setup_handlers()

    def _setup_handlers(self):
        @self.server.list_resources()
        async def handle_list_resources() -> List[Resource]:
            """List available readsb resources"""
            return [
                Resource(
                    uri=AnyUrl(f"{self.api_base}/aircraft.json"),
                    name="Aircraft Data",
                    description="Current aircraft positions and data",
                    mimeType="application/json",
                ),
                Resource(
                    uri=AnyUrl(f"{self.api_base}/stats.json"),
                    name="Statistics",
                    description="readsb receiver statistics",
                    mimeType="application/json",
                ),
                Resource(
                    uri=AnyUrl(f"{self.api_base}/receiver.json"),
                    name="Receiver Info",
                    description="Receiver configuration and status",
                    mimeType="application/json",
                ),
                Resource(
                    uri=AnyUrl(f"{self.web_base}/data/aircraft.json"),
                    name="TAR1090 Aircraft",
                    description="Aircraft data from TAR1090 web interface",
                    mimeType="application/json",
                ),
            ]

        @self.server.read_resource()
        async def handle_read_resource(uri: AnyUrl) -> str:
            """Read readsb resource data"""
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(str(uri))
                    response.raise_for_status()
                    return response.text
            except Exception as e:
                logger.error(f"Error reading resource {uri}: {e}")
                raise

        @self.server.list_tools()
        async def handle_list_tools() -> List[Tool]:
            """List available readsb tools"""
            return [
                Tool(
                    name="get_aircraft_data",
                    description="Get current aircraft positions and information",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "format": {
                                "type": "string",
                                "enum": ["json", "summary"],
                                "default": "json",
                                "description": "Output format: 'json' for raw data, 'summary' for human-readable",
                            },
                            "filter_distance": {
                                "type": "number",
                                "description": "Filter aircraft within this distance (nautical miles)",
                            },
                            "filter_altitude": {
                                "type": "object",
                                "properties": {
                                    "min": {"type": "number"},
                                    "max": {"type": "number"},
                                },
                                "description": "Filter aircraft by altitude range (feet)",
                            },
                        },
                    },
                ),
                Tool(
                    name="get_receiver_stats",
                    description="Get readsb receiver statistics and performance metrics",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "format": {
                                "type": "string",
                                "enum": ["json", "summary"],
                                "default": "summary",
                                "description": "Output format",
                            }
                        },
                    },
                ),
                Tool(
                    name="search_aircraft",
                    description="Search for specific aircraft by callsign, hex code, or flight number",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Search query (callsign, hex code, or flight number)",
                            },
                            "search_type": {
                                "type": "string",
                                "enum": ["callsign", "hex", "flight", "any"],
                                "default": "any",
                                "description": "Type of search to perform",
                            },
                        },
                        "required": ["query"],
                    },
                ),
                Tool(
                    name="get_range_statistics",
                    description="Get receiver range and coverage statistics",
                    inputSchema={"type": "object", "properties": {}},
                ),
                Tool(
                    name="get_closest_aircraft",
                    description="Get the N closest aircraft to the feeder location",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "count": {
                                "type": "integer",
                                "default": 5,
                                "minimum": 1,
                                "maximum": 50,
                                "description": "Number of closest aircraft to return (1-50)",
                            },
                            "max_distance": {
                                "type": "number",
                                "description": "Maximum distance to consider (nautical miles)",
                            },
                        },
                    },
                ),
                Tool(
                    name="get_aircraft_by_direction",
                    description="Get aircraft in a specific direction from the feeder",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "direction": {
                                "type": "string",
                                "enum": [
                                    "north",
                                    "south",
                                    "east",
                                    "west",
                                    "northeast",
                                    "northwest",
                                    "southeast",
                                    "southwest",
                                ],
                                "description": "Direction to search for aircraft",
                            },
                            "max_distance": {
                                "type": "number",
                                "description": "Maximum distance to consider (nautical miles)",
                            },
                            "count": {
                                "type": "integer",
                                "default": 10,
                                "minimum": 1,
                                "maximum": 50,
                                "description": "Maximum number of aircraft to return",
                            },
                        },
                        "required": ["direction"],
                    },
                ),
            ]

        @self.server.call_tool()
        async def handle_call_tool(name: str, arguments: Dict[str, Any]) -> List[TextContent]:
            """Handle tool calls"""
            try:
                if name == "get_aircraft_data":
                    return await self._get_aircraft_data(arguments)
                elif name == "get_receiver_stats":
                    return await self._get_receiver_stats(arguments)
                elif name == "search_aircraft":
                    return await self._search_aircraft(arguments)
                elif name == "get_range_statistics":
                    return await self._get_range_statistics(arguments)
                elif name == "get_closest_aircraft":
                    return await self._get_closest_aircraft(arguments)
                elif name == "get_aircraft_by_direction":
                    return await self._get_aircraft_by_direction(arguments)
                else:
                    raise ValueError(f"Unknown tool: {name}")
            except Exception as e:
                logger.error(f"Error in tool {name}: {e}")
                return [TextContent(type="text", text=f"Error: {str(e)}")]

    async def _fetch_json(self, endpoint: str) -> Dict[str, Any]:
        """Fetch JSON data from readsb API"""
        url = f"{self.api_base}/{endpoint}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()  # type: ignore[return-value,no-any-return]

    async def _get_aircraft_data(self, args: Dict[str, Any]) -> List[TextContent]:
        """Get aircraft data with optional filtering"""
        try:
            data = await self._fetch_json("aircraft.json")
            aircraft_list = data.get("aircraft", [])

            # Apply filters
            if "filter_distance" in args:
                max_dist = args["filter_distance"]
                aircraft_list = [a for a in aircraft_list if a.get("r_dst", 0) <= max_dist]

            if "filter_altitude" in args:
                alt_filter = args["filter_altitude"]
                min_alt = alt_filter.get("min", 0)
                max_alt = alt_filter.get("max", 50000)
                aircraft_list = [a for a in aircraft_list if min_alt <= a.get("alt_baro", 0) <= max_alt]

            format_type = args.get("format", "json")

            if format_type == "summary":
                summary = self._format_aircraft_summary(aircraft_list, data)
                return [TextContent(type="text", text=summary)]
            else:
                filtered_data = {**data, "aircraft": aircraft_list}
                return [TextContent(type="text", text=json.dumps(filtered_data, indent=2))]

        except Exception as e:
            return [TextContent(type="text", text=f"Error fetching aircraft data: {e}")]

    def _format_aircraft_summary(self, aircraft_list: List[Dict], full_data: Dict) -> str:
        """Format aircraft data as human-readable summary"""
        total_aircraft = len(aircraft_list)
        with_pos = len([a for a in aircraft_list if "lat" in a and "lon" in a])

        summary = f"Aircraft Summary (Updated: {full_data.get('now', 'Unknown')})\n"
        summary += f"Total Aircraft: {total_aircraft}\n"
        summary += f"With Position: {with_pos}\n\n"

        if aircraft_list:
            summary += "Recent Aircraft:\n"
            for i, aircraft in enumerate(aircraft_list[:10]):  # Show first 10
                callsign = aircraft.get("flight", "").strip() or "Unknown"
                hex_code = aircraft.get("hex", "Unknown")
                altitude = aircraft.get("alt_baro", "Unknown")
                distance = aircraft.get("r_dst", "Unknown")

                summary += f"{i + 1:2d}. {callsign:<8} ({hex_code})\n"

                # Add map link if hex code is available
                if hex_code != "Unknown":
                    map_link = f"{self.web_base}/?icao={hex_code}"
                    summary += f"     Map Link: {map_link}\n"

                summary += f"     Alt: {altitude} ft, Dist: {distance} nm\n"

            if total_aircraft > 10:
                summary += f"... and {total_aircraft - 10} more aircraft\n"

        return summary

    async def _get_receiver_stats(self, args: Dict[str, Any]) -> List[TextContent]:
        """Get receiver statistics"""
        try:
            stats = await self._fetch_json("stats.json")
            format_type = args.get("format", "summary")

            if format_type == "summary":
                summary = self._format_stats_summary(stats)
                return [TextContent(type="text", text=summary)]
            else:
                return [TextContent(type="text", text=json.dumps(stats, indent=2))]

        except Exception as e:
            return [TextContent(type="text", text=f"Error fetching stats: {e}")]

    def _format_stats_summary(self, stats: Dict) -> str:
        """Format statistics as human-readable summary"""
        total = stats.get("total", {})
        last1min = stats.get("last1min", {})

        summary = "Receiver Statistics\n"
        summary += "==================\n\n"

        if total:
            summary += f"Total Messages: {total.get('messages', 0):,}\n"
            summary += f"Total Aircraft: {total.get('aircraft_with_pos', 0):,}\n"

        if last1min:
            summary += "\nLast Minute:\n"
            summary += f"  Messages: {last1min.get('messages', 0):,}\n"
            summary += f"  Aircraft: {last1min.get('aircraft_with_pos', 0):,}\n"

        # Add CPU and memory if available
        if "cpu" in stats:
            summary += f"\nSystem Load: {stats['cpu'].get('load', 'Unknown')}\n"

        return summary

    async def _search_aircraft(self, args: Dict[str, Any]) -> List[TextContent]:
        """Search for specific aircraft"""
        try:
            query = args["query"].upper().strip()

            # Validate query parameter
            if not query:
                return [TextContent(type="text", text="Search query cannot be empty")]

            search_type = args.get("search_type", "any")

            # Validate search_type parameter
            valid_search_types = ["callsign", "hex", "flight", "any"]
            if search_type not in valid_search_types:
                return [
                    TextContent(
                        type="text",
                        text=f"Invalid search_type '{search_type}'. Valid types are: {', '.join(valid_search_types)}",
                    )
                ]

            data = await self._fetch_json("aircraft.json")
            aircraft_list = data.get("aircraft", [])

            matches = []
            for aircraft in aircraft_list:
                if search_type in ["callsign", "any"]:
                    if query in aircraft.get("flight", "").strip().upper():
                        matches.append(aircraft)
                        continue

                if search_type in ["hex", "any"]:
                    if query in aircraft.get("hex", "").upper():
                        matches.append(aircraft)
                        continue

                if search_type in ["flight", "any"]:
                    if query in aircraft.get("flight", "").strip().upper():
                        matches.append(aircraft)

            if not matches:
                return [TextContent(type="text", text=f"No aircraft found matching '{query}' with search type '{search_type}'")]

            result = f"Found {len(matches)} aircraft matching '{query}':\n\n"
            for aircraft in matches:
                callsign = aircraft.get("flight", "").strip() or "Unknown"
                hex_code = aircraft.get("hex", "Unknown")
                altitude = aircraft.get("alt_baro", "Unknown")
                lat = aircraft.get("lat", "Unknown")
                lon = aircraft.get("lon", "Unknown")

                result += f"Callsign: {callsign}\n"
                result += f"Hex: {hex_code}\n"

                # Add map link if hex code is available
                if hex_code != "Unknown":
                    map_link = f"{self.web_base}/?icao={hex_code}"
                    result += f"Map Link: {map_link}\n"

                result += f"Altitude: {altitude} ft\n"
                result += f"Position: {lat}, {lon}\n"

                result += "-" * 30 + "\n"

            return [TextContent(type="text", text=result)]

        except Exception as e:
            return [TextContent(type="text", text=f"Error searching aircraft: {e}")]

    async def _get_range_statistics(self, args: Dict[str, Any]) -> List[TextContent]:
        """Get range and coverage statistics"""
        try:
            # Try to get receiver info which may contain range data
            receiver_data = await self._fetch_json("receiver.json")
            stats_data = await self._fetch_json("stats.json")

            summary = "Range Statistics\n"
            summary += "================\n\n"

            # Extract range information from receiver data
            if "lat" in receiver_data and "lon" in receiver_data:
                summary += f"Receiver Location: {receiver_data['lat']:.4f}, {receiver_data['lon']:.4f}\n"

            # Add statistics about ranges if available
            # first the total range
            if "total" in stats_data:
                total_stats = stats_data["total"]
                if "max_distance" in total_stats:
                    max_dist = total_stats["max_distance"]
                    summary += f"Max Range: {max_dist} meters or {max_dist * 0.000539957} nautical miles\n"
            # then the last15min range
            if "last15min" in stats_data:
                last15min_stats = stats_data["last15min"]
                if "max_distance" in last15min_stats:
                    last15max_dist = last15min_stats["max_distance"]
                    summary += f"Last 15 Minutes Max Range: {last15max_dist} meters or " f"{last15max_dist * 0.000539957} nautical miles\n"

            return [TextContent(type="text", text=summary)]

        except Exception as e:
            return [TextContent(type="text", text=f"Error fetching range statistics: {e}")]

    def _calculate_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two coordinates in nautical miles using Haversine formula"""
        import math

        # Convert to radians
        lat1_rad = math.radians(lat1)
        lon1_rad = math.radians(lon1)
        lat2_rad = math.radians(lat2)
        lon2_rad = math.radians(lon2)

        # Haversine formula
        dlat = lat2_rad - lat1_rad
        dlon = lon2_rad - lon1_rad

        a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
        c = 2 * math.asin(math.sqrt(a))

        # Earth radius in nautical miles
        earth_radius_nm = 3440.065
        distance = earth_radius_nm * c

        return distance

    def _calculate_bearing(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate bearing from point 1 to point 2 in degrees"""
        import math

        # Convert to radians
        lat1_rad = math.radians(lat1)
        lon1_rad = math.radians(lon1)
        lat2_rad = math.radians(lat2)
        lon2_rad = math.radians(lon2)

        dlon = lon2_rad - lon1_rad

        y = math.sin(dlon) * math.cos(lat2_rad)
        x = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(dlon)

        bearing = math.degrees(math.atan2(y, x))
        bearing = (bearing + 360) % 360  # Normalize to 0-360

        return bearing

    def _get_direction_range(self, direction: str) -> tuple[float, float]:
        """Get bearing range for a direction (min, max) in degrees"""
        direction_ranges = {
            "north": (337.5, 22.5),
            "northeast": (22.5, 67.5),
            "east": (67.5, 112.5),
            "southeast": (112.5, 157.5),
            "south": (157.5, 202.5),
            "southwest": (202.5, 247.5),
            "west": (247.5, 292.5),
            "northwest": (292.5, 337.5),
        }
        return direction_ranges.get(direction, (0, 360))

    async def _get_closest_aircraft(self, args: Dict[str, Any]) -> List[TextContent]:
        """Get the N closest aircraft to the feeder"""
        try:
            count = args.get("count", 5)

            # Validate count parameter
            if not isinstance(count, int) or count < 1 or count > 50:
                return [TextContent(type="text", text="Invalid count parameter. Must be an integer between 1 and 50")]

            max_distance = args.get("max_distance")

            # Get receiver location
            receiver_data = await self._fetch_json("receiver.json")
            feeder_lat = receiver_data.get("lat")
            feeder_lon = receiver_data.get("lon")

            if not feeder_lat or not feeder_lon:
                return [TextContent(type="text", text="Error: Receiver location cannot be determined from feeder data")]

            # Get aircraft data
            aircraft_data = await self._fetch_json("aircraft.json")
            aircraft_list = aircraft_data.get("aircraft", [])

            # Filter aircraft with positions and calculate distances
            aircraft_with_distances = []
            for aircraft in aircraft_list:
                if "lat" in aircraft and "lon" in aircraft:
                    distance = self._calculate_distance(feeder_lat, feeder_lon, aircraft["lat"], aircraft["lon"])

                    # Apply max distance filter if specified
                    if max_distance is None or distance <= max_distance:
                        aircraft_with_distances.append((distance, aircraft))

            # Sort by distance and take the closest ones
            aircraft_with_distances.sort(key=lambda x: x[0])
            closest_aircraft = aircraft_with_distances[:count]

            if not closest_aircraft:
                if max_distance:
                    return [TextContent(type="text", text=f"No aircraft found within {max_distance} nautical miles of the feeder")]
                else:
                    return [TextContent(type="text", text="No aircraft found near the feeder at this time")]

            # Format results
            result = f"Closest {len(closest_aircraft)} aircraft to feeder ({feeder_lat:.4f}, {feeder_lon:.4f}):\n\n"

            for i, (distance, aircraft) in enumerate(closest_aircraft, 1):
                callsign = aircraft.get("flight", "").strip() or "Unknown"
                hex_code = aircraft.get("hex", "Unknown")
                altitude = aircraft.get("alt_baro", "Unknown")
                speed = aircraft.get("gs", "Unknown")
                track = aircraft.get("track", "Unknown")
                lat = aircraft.get("lat", "Unknown")
                lon = aircraft.get("lon", "Unknown")

                result += f"{i}. {callsign:<10} ({hex_code})\n"

                # Add map link if hex code is available
                if hex_code != "Unknown":
                    map_link = f"{self.web_base}/?icao={hex_code}"
                    result += f"   Map Link: {map_link}\n"

                result += f"   Distance: {distance:.1f} nm\n"
                result += f"   Altitude: {altitude} ft\n"
                result += f"   Speed: {speed} kts\n"
                result += f"   Track: {track}°\n"
                result += f"   Position: {lat:.4f}, {lon:.4f}\n"

                result += "-" * 50 + "\n"

            return [TextContent(type="text", text=result)]

        except Exception as e:
            return [TextContent(type="text", text=f"Error getting closest aircraft: {e}")]

    async def _get_aircraft_by_direction(self, args: Dict[str, Any]) -> List[TextContent]:
        """Get aircraft in a specific direction from the feeder"""
        try:
            direction = args["direction"].lower()

            # Validate direction parameter
            valid_directions = ["north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest"]
            if direction not in valid_directions:
                return [
                    TextContent(
                        type="text",
                        text=f"Invalid direction '{direction}'. Valid directions are: {', '.join(valid_directions)}",
                    )
                ]

            max_distance = args.get("max_distance")
            count = args.get("count", 10)

            # Validate count parameter
            if not isinstance(count, int) or count < 1 or count > 50:
                return [TextContent(type="text", text="Invalid count parameter. Must be an integer between 1 and 50")]

            # Get receiver location
            receiver_data = await self._fetch_json("receiver.json")
            feeder_lat = receiver_data.get("lat")
            feeder_lon = receiver_data.get("lon")

            if not feeder_lat or not feeder_lon:
                return [TextContent(type="text", text="Error: Receiver location cannot be determined from feeder data")]

            # Get direction bearing range
            min_bearing, max_bearing = self._get_direction_range(direction)

            # Get aircraft data
            aircraft_data = await self._fetch_json("aircraft.json")
            aircraft_list = aircraft_data.get("aircraft", [])

            # Filter aircraft by direction and distance
            directional_aircraft = []
            for aircraft in aircraft_list:
                if "lat" in aircraft and "lon" in aircraft:
                    # Calculate bearing from feeder to aircraft
                    bearing = self._calculate_bearing(feeder_lat, feeder_lon, aircraft["lat"], aircraft["lon"])

                    # Check if aircraft is in the specified direction
                    if min_bearing <= max_bearing:
                        in_direction = min_bearing <= bearing <= max_bearing
                    else:  # Handle wraparound (e.g., north: 337.5-22.5)
                        in_direction = bearing >= min_bearing or bearing <= max_bearing

                    if in_direction:
                        distance = self._calculate_distance(feeder_lat, feeder_lon, aircraft["lat"], aircraft["lon"])

                        # Apply max distance filter if specified
                        if max_distance is None or distance <= max_distance:
                            directional_aircraft.append((distance, bearing, aircraft))

            # Sort by distance and limit count
            directional_aircraft.sort(key=lambda x: x[0])
            directional_aircraft = directional_aircraft[:count]

            if not directional_aircraft:
                if max_distance:
                    return [
                        TextContent(
                            type="text",
                            text=(f"No aircraft found to the {direction} within " f"{max_distance} nautical miles of the feeder"),
                        )
                    ]
                else:
                    return [TextContent(type="text", text=f"No aircraft found to the {direction} of the feeder at this time")]

            # Format results
            result = f"Aircraft to the {direction} of feeder ({feeder_lat:.4f}, {feeder_lon:.4f}):\n\n"
            result += f"Found {len(directional_aircraft)} aircraft\n\n"

            for i, (distance, bearing, aircraft) in enumerate(directional_aircraft, 1):
                callsign = aircraft.get("flight", "").strip() or "Unknown"
                hex_code = aircraft.get("hex", "Unknown")
                altitude = aircraft.get("alt_baro", "Unknown")
                speed = aircraft.get("gs", "Unknown")
                track = aircraft.get("track", "Unknown")
                lat = aircraft.get("lat", "Unknown")
                lon = aircraft.get("lon", "Unknown")

                result += f"{i}. {callsign:<10} ({hex_code})\n"

                # Add map link if hex code is available
                if hex_code != "Unknown":
                    map_link = f"{self.web_base}/?icao={hex_code}"
                    result += f"   Map Link: {map_link}\n"

                result += f"   Distance: {distance:.1f} nm\n"
                result += f"   Bearing: {bearing:.1f}°\n"
                result += f"   Altitude: {altitude} ft\n"
                result += f"   Speed: {speed} kts\n"
                result += f"   Track: {track}°\n"
                result += f"   Position: {lat:.4f}, {lon:.4f}\n"

                result += "-" * 50 + "\n"

            return [TextContent(type="text", text=result)]

        except Exception as e:
            return [TextContent(type="text", text=f"Error getting aircraft by direction: {e}")]

    async def test_mode(self):
        """Run in test mode - test endpoints and keep server alive"""
        logger.info("Starting MCP server in test mode")

        # Test the endpoints first
        try:
            logger.info("Testing readsb endpoints...")

            # Test aircraft data
            aircraft_data = await self._fetch_json("aircraft.json")
            aircraft_count = len(aircraft_data.get("aircraft", []))
            logger.info(f"Aircraft endpoint OK - {aircraft_count} aircraft found")

            # Test stats
            stats_data = await self._fetch_json("stats.json")
            total_messages = stats_data.get("total", {}).get("messages", 0)
            logger.info(f"Stats endpoint OK - {total_messages:,} total messages")

            # Test receiver info
            receiver_data = await self._fetch_json("receiver.json")
            logger.info(f"Receiver endpoint OK - Version: {receiver_data.get('version', 'Unknown')}")

        except Exception as e:
            logger.error(f"Endpoint test failed: {e}")
            logger.info("Server will still run, but endpoints may not work")

        logger.info("MCP server is ready and waiting for connections...")
        logger.info("Use Ctrl+C to stop the server")

        # Keep the server running
        try:
            while True:
                await asyncio.sleep(30)  # Check every 30 seconds
                logger.info("MCP server still running...")
        except KeyboardInterrupt:
            logger.info("Server stopped by user")

    async def run(self):
        """Run the MCP server"""
        # Import here to avoid issues if mcp package is not available
        from mcp.server.stdio import stdio_server

        logger.info("Starting MCP server in stdio mode")

        try:
            async with stdio_server() as (read_stream, write_stream):
                logger.info("MCP server connected via stdio")
                await self.server.run(
                    read_stream,
                    write_stream,
                    InitializationOptions(
                        server_name="readsb-mcp",
                        server_version="1.0.0",
                        capabilities=self.server.get_capabilities(
                            notification_options=NotificationOptions(),
                            experimental_capabilities={},
                        ),
                    ),
                )
        except Exception as e:
            logger.error(f"MCP server error: {e}")
            raise


def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description="readsb MCP Server")
    parser.add_argument(
        "--base-url",
        default="http://localhost",
        help="Base URL for readsb/Ultrafeeder (default: http://localhost)",
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Run in test mode - test endpoints and keep running",
    )

    args = parser.parse_args()
    logger.info(f"parsed args {args}")

    server = ReadsbMCPServer(base_url=args.base_url)
    logger.info("created server")

    if args.test:
        asyncio.run(server.test_mode())
    else:
        asyncio.run(server.run())
    logger.info("server finished")


if __name__ == "__main__":
    main()
