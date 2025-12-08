# Mock champ select replay (for frontend dev)

Use a recorded capture JSON to drive the app without connecting to the live LCU.

## Prerequisites
- Go installed (repo already vendor-locks modules via `go.mod`).
- At least one capture JSON in `capture/captures/` (e.g. `champ-select-capture_20251208_132711.json`).

## Start the mock server
From repo root:
```bash
go run ./capture/mock-champ-select -addr 127.0.0.1:18080
```
- If `-capture` is omitted, the tool scans `capture/captures/*.json`, `capture/*.json`, and local `captures/*.json`, then prompts you to pick one.
- To force a specific file:
```bash
go run ./capture/mock-champ-select -capture capture/captures/champ-select-capture_20251208_132711.json -addr 127.0.0.1:18080
```

## What it serves
- Websocket: `ws://127.0.0.1:18080/ws` (streams the captured `rawData` payloads exactly like the LCU socket).
- Health: `http://127.0.0.1:18080/health` (shows current step and total steps).

## Stepping through the capture
The CLI opens an interactive prompt:
- `next` / `prev` — move one step and broadcast.
- `jump <n>` / `send <n>` — go to step n (0-based) and broadcast.
- `reset` — set index to 0 (no broadcast).
- `inspect` / `current` — print current step summary.
- `quit` — exit.

## Using it with the frontend
Point whatever part of the frontend consumes the LCU champ-select websocket to `ws://127.0.0.1:18080/ws` instead of the live LCU URL. Then drive the CLI (next/jump) to send events and observe UI updates. The payload shape matches the real LCU event stream, so existing parsing/mapping logic should work unchanged.

