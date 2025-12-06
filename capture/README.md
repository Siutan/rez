# Champion Select Capture Script

This script captures all champion select events from the League of Legends Client (LCU) and saves them to a JSON file.

## Usage

### Basic Usage
```bash
go run capture/main.go
```

This will create a timestamped JSON file (e.g., `champ-select-capture_20240101_120000.json`) in the current directory.

### Custom Output File
```bash
go run capture/main.go output.json
```

### Build and Run
```bash
# Build the executable
go build -o champ-select-capture.exe capture/main.go

# Run the executable
./champ-select-capture.exe
```

## How It Works

1. **Connection**: The script automatically finds and connects to the League Client (LCU) when it's running.

2. **Event Capture**: Once in champion select, the script captures all events:
   - **Create**: When champion select starts
   - **Update**: All updates during champion select (picks, bans, phase changes, etc.)
   - **Delete**: When champion select ends

3. **Output**: All events are saved to a JSON file with timestamps and complete session data.

## Output Format

The JSON file contains raw, unprocessed data exactly as received from the League Client:
- `startTime`: When capture started
- `endTime`: When champion select ended
- `eventCount`: Total number of events captured
- `events`: Array of all captured events, each containing:
  - `timestamp`: When the event occurred (RFC3339Nano format)
  - `rawData`: Complete raw WebSocket payload as received from LCU (no type constraints, all fields preserved)

The `rawData` field contains the complete WebSocket message array:
- `[0]`: Message type (5 for subscription)
- `[1]`: Event name ("OnJsonApiEvent_lol-champ-select_v1_session")
- `[2]`: Event data object from LCU (varies by event type)

All data is captured as raw JSON without any type constraints, so you'll see all fields exactly as they come from the API.

## Requirements

- League of Legends client must be running
- Go 1.23 or later
- Dependencies from `go.mod`

## Example Output

```json
{
  "startTime": "2024-01-01T12:00:00Z",
  "endTime": "2024-01-01T12:05:30Z",
  "eventCount": 45,
  "events": [
    {
      "timestamp": "2024-01-01T12:00:01.123456789Z",
      "rawData": [
        5,
        "OnJsonApiEvent_lol-champ-select_v1_session",
        {
          "eventType": "Create",
          "data": {
            "actions": [...],
            "bans": {...},
            "myTeam": [...],
            "theirTeam": [...],
            "timer": {...},
            "gameId": 1234567890,
            "queueId": 420,
            ...
          }
        }
      ]
    },
    ...
  ]
}
```

Note: The `rawData` contains the complete WebSocket payload exactly as received. All fields from the LCU API are preserved, including any that might not be documented or may change in future versions.

## Notes

- The script will wait for LCU connection if League is not running
- Press `Ctrl+C` to stop capturing (will save any captured events)
- Events are captured in real-time as they occur
- The script saves automatically when champion select ends

