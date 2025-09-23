# MCP Server Usage Examples

This document provides practical examples of how to use the enhanced readsb MCP server with the new aircraft query capabilities.

## Example Queries

### 1. Find the 5 Closest Aircraft

**Query:** "What are the five closest planes to my feeder?"

**MCP Tool Call:**
```json
{
  "tool": "get_closest_aircraft",
  "arguments": {
    "count": 5
  }
}
```

**Expected Output:**
```
Closest 5 aircraft to feeder (40.7128, -74.0060):

1. AAL123     (abc123)
   Distance: 12.3 nm
   Altitude: 25000 ft
   Speed: 450 kts
   Track: 045°
   Position: 40.7234, -73.9856
--------------------------------------------------
2. UAL456     (def456)
   Distance: 15.7 nm
   Altitude: 18000 ft
   Speed: 320 kts
   Track: 270°
   Position: 40.6891, -74.1234
--------------------------------------------------
...
```

### 2. Find Aircraft to the East

**Query:** "What plane is to the east of me?"

**MCP Tool Call:**
```json
{
  "tool": "get_aircraft_by_direction",
  "arguments": {
    "direction": "east",
    "count": 10
  }
}
```

**Expected Output:**
```
Aircraft to the east of feeder (40.7128, -74.0060):

Found 3 aircraft

1. DAL789     (ghi789)
   Distance: 8.2 nm
   Bearing: 087.3°
   Altitude: 12000 ft
   Speed: 280 kts
   Track: 090°
   Position: 40.7156, -73.9234
--------------------------------------------------
...
```

### 3. Find Aircraft to the North Within 50 Miles

**Query:** "Show me aircraft to the north within 50 nautical miles"

**MCP Tool Call:**
```json
{
  "tool": "get_aircraft_by_direction",
  "arguments": {
    "direction": "north",
    "max_distance": 50,
    "count": 20
  }
}
```

### 4. Find Closest Aircraft Within 100 Miles

**Query:** "What are the closest planes within 100 miles?"

**MCP Tool Call:**
```json
{
  "tool": "get_closest_aircraft",
  "arguments": {
    "count": 10,
    "max_distance": 100
  }
}
```

### 5. Find Aircraft in Northeast Quadrant

**Query:** "Show me aircraft to the northeast"

**MCP Tool Call:**
```json
{
  "tool": "get_aircraft_by_direction",
  "arguments": {
    "direction": "northeast",
    "count": 15
  }
}
```

## Direction Mapping

The server supports these directional queries:

- `north` - 337.5° to 22.5°
- `northeast` - 22.5° to 67.5°
- `east` - 67.5° to 112.5°
- `southeast` - 112.5° to 157.5°
- `south` - 157.5° to 202.5°
- `southwest` - 202.5° to 247.5°
- `west` - 247.5° to 292.5°
- `northwest` - 292.5° to 337.5°

## Integration with AI Assistants

### Claude/ChatGPT Integration

You can ask natural language questions like:

- "What are the 5 closest planes to my feeder?"
- "Show me all aircraft to the east within 25 miles"
- "Are there any planes to the north?"
- "What's the closest aircraft to the south?"
- "Find aircraft in the northeast quadrant within 50 miles"

The MCP server will automatically:
1. Parse your location from the readsb receiver configuration
2. Calculate distances using the Haversine formula
3. Determine bearing directions accurately
4. Filter and sort results as requested
5. Return formatted, human-readable responses

### Example Conversation

**User:** "What are the closest 3 aircraft to my feeder?"

**Assistant:** I'll check the closest aircraft to your feeder location.

**MCP Call:** `get_closest_aircraft({"count": 3})`

**Response:**
```
Closest 3 aircraft to feeder (40.7128, -74.0060):

1. SWA123     (abc123)
   Distance: 8.5 nm
   Altitude: 15000 ft
   Speed: 380 kts
   Track: 045°
   Position: 40.7234, -73.9856
--------------------------------------------------
2. JBU456     (def456)
   Distance: 12.1 nm
   Altitude: 22000 ft
   Speed: 420 kts
   Track: 180°
   Position: 40.6891, -74.0234
--------------------------------------------------
3. FFT789     (ghi789)
   Distance: 15.3 nm
   Altitude: 8000 ft
   Speed: 250 kts
   Track: 270°
   Position: 40.7456, -74.1567
--------------------------------------------------
```

## Error Handling

The server handles various error conditions gracefully:

- **No feeder location**: Returns error if receiver location cannot be determined
- **No aircraft found**: Returns informative message when no aircraft match criteria
- **Network issues**: Returns connection error messages
- **Invalid parameters**: Validates input parameters and provides helpful error messages

## Performance Notes

- Distance calculations use the Haversine formula for accuracy
- Bearing calculations handle wraparound (e.g., north: 337.5°-22.5°)
- Results are sorted by distance for closest aircraft queries
- Maximum limits prevent excessive processing (50 aircraft max per query)
- All calculations are done in nautical miles and degrees

## Testing

Use the included test script to verify functionality:

```bash
cd MCP
python test/test_remote_connection.py
```

This will test the new features against your local readsb instance.

