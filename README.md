# README

## About

This is the official Wails Svelte template.

## Live Development

To run in live development mode, run `wails dev` in the project directory. This will run a Vite development
server that will provide very fast hot reload of your frontend changes. If you want to develop in a browser
and have access to your Go methods, there is also a dev server that runs on http://localhost:34115. Connect
to this in your browser, and you can call your Go code from devtools.

## Building

To build a redistributable, production mode package, use `wails build`.

## Mock champ select websocket CLI

Replay captured champ select sessions over a local websocket to test the UI without connecting to the live LCU.

Run (default capture & port):

```
go run ./capture/mock-champ-select
```

Specify a capture and port:

```
go run ./capture/mock-champ-select -capture champ-select-capture_20251208_132711.json -addr 127.0.0.1:18081
```

If `-capture` is omitted, the CLI scans `capture/captures/*.json`, `capture/*.json`, or local `captures/*.json` and prompts you to pick one (defaults to the first).

### Mock mode (app)
- Set `MOCK_CHAMP_SELECT=1` (and optionally `MOCK_WS_URL` if your mock server is not `ws://127.0.0.1:18080/ws`).
- Start the mock websocket server via `go run ./capture/mock-champ-select`.
- Run the app normally (`wails dev` or `wails build && ./rez`) and it will consume champ-select data from the mock server instead of the live LCU.

Endpoints:

- Websocket: `ws://<addr>/ws` (sends the raw `rawData` payloads from the capture)
- Health: `http://<addr>/health` (shows current index and step count)

REPL commands:

- `next` / `prev` – move one step and broadcast
- `jump <n>` / `send <n>` – go to index n (0-based) and broadcast
- `reset` – set index to 0 (no broadcast)
- `inspect` / `current` – print the current step summary
- `help`, `quit`
