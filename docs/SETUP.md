# VPS Setup Guide

This runs the platform's management API directly on your existing VPS,
alongside your current Node app, using Docker to isolate each hosted bot.

## 1. Check / install Docker

You likely don't have Docker yet if only a plain Node app has been running.

```bash
# Check first
docker --version

# If missing, install (Ubuntu/Debian):
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in for the group change to apply
docker run hello-world   # sanity check
```

## 2. Install Node.js (if not already the right version)

The platform code targets Node 20+.

```bash
node -v
# if you need to upgrade, e.g. via nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 20
nvm use 20
```

## 3. Pick a port that won't collide with your existing app

Your current Node app is already running on some port (commonly 3000).
This platform's API should run on a **different** port. The default in
`.env.example` is `4000` — check `sudo lsof -i -P -N | grep LISTEN` or
`ss -tulpn` to confirm 4000 (or whatever you choose) is free.

## 4. Deploy the platform code

```bash
# From your local machine, copy the project to the VPS (adjust path/host):
scp -r bot-hosting-platform your-user@your-vps-ip:/opt/bot-hosting-platform

# On the VPS:
cd /opt/bot-hosting-platform
cp .env.example .env
nano .env   # set PORT, a strong random API_KEY, and resource limits

npm install
```

## 5. Run it

For a first test:

```bash
npm start
```

Check it's alive:

```bash
curl http://localhost:4000/health
# {"ok":true}
```

For production, keep it running after you disconnect — use `pm2` (works
well alongside your existing Node app) or a systemd service:

```bash
npm install -g pm2
pm2 start server.js --name bot-hosting-api
pm2 save
pm2 startup   # follow the printed instructions to enable on boot
```

## 6. Open the port (if you have a firewall)

```bash
sudo ufw allow 4000/tcp   # match whatever PORT you set
```

If you'll only ever call this API from a dashboard running on the same
VPS (e.g. reverse-proxied via nginx), you can instead keep 4000 closed
to the outside world and only expose it through nginx on 443.

## 7. Smoke test the deploy flow

```bash
export API_KEY=<the value you put in .env>

# Deploy a bot from a public repo
curl -X POST http://localhost:4000/api/bots \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-bot","repoUrl":"https://github.com/some-user/some-whatsapp-bot","branch":"main"}'

# Response: {"id":"abc123xyz0","status":"created"}

# Poll status
curl http://localhost:4000/api/bots/abc123xyz0 \
  -H "Authorization: Bearer $API_KEY"

# List all bots
curl http://localhost:4000/api/bots -H "Authorization: Bearer $API_KEY"

# Stop it
curl -X POST http://localhost:4000/api/bots/abc123xyz0/stop \
  -H "Authorization: Bearer $API_KEY"

# Start it again
curl -X POST http://localhost:4000/api/bots/abc123xyz0/start \
  -H "Authorization: Bearer $API_KEY"
```

For live logs, connect a WebSocket client to:

```
ws://your-vps-ip:4000/ws/bots/abc123xyz0/logs?token=<API_KEY>
```

## Notes / known limitations of this MVP

- **Single shared API key** — fine for you as the only operator right
  now. Before opening this to other users, swap `src/auth.js` for real
  per-user accounts + JWTs, and scope bots to their owner in the DB.
- **Public repos only** as written — private repo cloning needs a
  GitHub token passed to `simple-git`'s clone URL or an SSH deploy key
  set up on the VPS.
- **Generic Dockerfile fallback** assumes a standard `npm start` Node
  bot. Bots with unusual entry points need their own `Dockerfile` in
  the repo (the platform uses it automatically if present).
- **No dashboard yet** — this is the backend API only. Next step is a
  Next.js frontend that calls these endpoints and renders the WS log
  stream.
- **Disk usage** — cloned repos and built images accumulate on disk.
  Add a cleanup job before this goes to many users.
