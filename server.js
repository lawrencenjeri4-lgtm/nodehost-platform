import 'dotenv/config';
import express from 'express';
import http from 'http';
import { requireApiKey } from './src/auth.js';
import { router as botsRouter } from './src/routes/bots.js';
import { attachLogSocket } from './src/ws/logs.js';

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/bots', requireApiKey, botsRouter);

const server = http.createServer(app);
attachLogSocket(server, process.env.API_KEY);

const port = process.env.PORT || 4000;
server.listen(port, () => {
  console.log(`bot-hosting-platform API listening on :${port}`);
});
