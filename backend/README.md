# Elysia with Bun runtime

## Getting Started
To get started with this template, simply paste this command into your terminal:
```bash
bun create elysia ./elysia-example
```

## Development
To start the development server run:
```bash
bun run dev
```

Open http://localhost:3000/ with your browser to see the result.

## U.GG profile refresh
- Set `UGG_COOKIE` (and optionally `UGG_USER_AGENT`, `UGG_APP_VERSION`) in the environment so the UpdatePlayerProfile mutation can run.
- Before fetching user stats we trigger UpdatePlayerProfile, skipping if the profile was refreshed in the last 10 minutes.
- Non-current users refresh at most every 45 minutes; current-user (draft-phase) requests refresh every draft as long as 10 minutes have passed.