import { WebSocketServer } from 'ws';
import { getBot } from '../db.js';
import { streamLogs } from '../docker.js';

// Mounts a WS endpoint at /ws/bots/:id/logs?token=API_KEY
// The dashboard connects here to receive a live tail of a bot's container output.
export function attachLogSocket(server, apiKey) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/ws\/bots\/([^/]+)\/logs$/);
    if (!match) return socket.destroy();

    const token = url.searchParams.get('token');
    if (token !== apiKey) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, match[1]);
    });
  });

  wss.on('connection', async (ws, req, botId) => {
    const bot = getBot(botId);
    if (!bot || !bot.container_id) {
      ws.send('No running container for this bot.');
      return ws.close();
    }

    let dockerStream;
    try {
      dockerStream = await streamLogs(bot.container_id, (chunk) => {
        if (ws.readyState === ws.OPEN) ws.send(chunk);
      });
    } catch (err) {
      ws.send(`Failed to attach to logs: ${err.message}`);
      return ws.close();
    }

    ws.on('close', () => dockerStream?.destroy());
  });
}
