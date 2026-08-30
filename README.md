# bot-hosting-platform

MVP backend for a nodeX-style WhatsApp bot hosting platform: deploy a bot
from a GitHub repo, run it in an isolated Docker container, stream its
logs live, and start/stop it on demand. Payments/wallet are intentionally
left out of this phase.

## Quick start

See [`docs/SETUP.md`](docs/SETUP.md) for full VPS setup instructions.

```bash
cp .env.example .env   # edit PORT / API_KEY / resource limits
npm install
npm start
```

## API surface

| Method | Path                       | Purpose                          |
|--------|----------------------------|-----------------------------------|
| GET    | `/health`                  | Liveness check (no auth)          |
| GET    | `/api/bots`                | List all bots                     |
| POST   | `/api/bots`                | Deploy a new bot (`name`, `repoUrl`, `branch?`) |
| GET    | `/api/bots/:id`            | Get one bot's status              |
| POST   | `/api/bots/:id/start`      | Start a stopped bot's container   |
| POST   | `/api/bots/:id/stop`       | Stop a running bot's container    |
| DELETE | `/api/bots/:id`            | Remove a bot and its container    |
| WS     | `/ws/bots/:id/logs?token=` | Live log stream                   |

All REST routes except `/health` require `Authorization: Bearer <API_KEY>`.

## Architecture

```
Dashboard (Next.js, e.g. on Vercel)
        │  REST + WebSocket
        ▼
Management API (this repo — Express, on your VPS)
        │  dockerode
        ▼
Docker Engine  →  one container per deployed bot
```

## Next steps

1. Build the Next.js dashboard against this API (bot list, deploy form,
   start/stop buttons, live log viewer).
2. Replace the shared `API_KEY` with real user accounts.
3. Add private-repo support (deploy keys or GitHub tokens).
4. Layer in the coin wallet + payments once the core flow is solid.
