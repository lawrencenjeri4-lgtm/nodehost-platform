import express from 'express';
import { nanoid } from 'nanoid';
import { insertBot, updateBot, getBot, listBots, deleteBot } from '../db.js';
import {
  cloneRepo,
  buildImage,
  runContainer,
  stopContainer,
  startContainer,
  removeContainer,
  getContainerStatus,
} from '../docker.js';

export const router = express.Router();

// List all bots
router.get('/', (req, res) => {
  res.json(listBots());
});

// Deploy a new bot from a GitHub repo.
// Body: { name, repoUrl, branch? }
// Runs the clone+build+run asynchronously; poll GET /:id for status.
router.post('/', async (req, res) => {
  const { name, repoUrl, branch } = req.body || {};
  if (!name || !repoUrl) {
    return res.status(400).json({ error: 'name and repoUrl are required' });
  }

  const id = nanoid(10);
  insertBot({ id, name, repo_url: repoUrl, branch: branch || 'main', status: 'created' });
  res.status(202).json({ id, status: 'created' });

  // Fire-and-forget deploy pipeline; status is updated in the DB as it progresses.
  deployPipeline(id, repoUrl, branch || 'main').catch((err) => {
    updateBot(id, { status: 'failed', error: String(err.message || err) });
  });
});

async function deployPipeline(id, repoUrl, branch) {
  updateBot(id, { status: 'building' });
  const buildDir = await cloneRepo(id, repoUrl, branch);
  const imageTag = await buildImage(id, buildDir, (line) => {
    // In a fuller version, pipe these build logs to the same WS log channel.
    console.log(`[build ${id}] ${line}`);
  });
  const { containerId, containerName } = await runContainer(id, imageTag);
  updateBot(id, {
    status: 'running',
    container_id: containerId,
    container_name: containerName,
    image_tag: imageTag,
    error: null,
  });
}

// Get a single bot's current record (status is refreshed against Docker).
router.get('/:id', async (req, res) => {
  const bot = getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Not found' });

  if (bot.container_id && (bot.status === 'running' || bot.status === 'stopped')) {
    const liveStatus = await getContainerStatus(bot.container_id);
    if (liveStatus !== 'unknown' && liveStatus !== bot.status) {
      updateBot(bot.id, { status: liveStatus });
      bot.status = liveStatus;
    }
  }
  res.json(bot);
});

router.post('/:id/stop', async (req, res) => {
  const bot = getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Not found' });
  if (!bot.container_id) return res.status(400).json({ error: 'Bot has no running container' });

  await stopContainer(bot.container_id);
  updateBot(bot.id, { status: 'stopped' });
  res.json({ id: bot.id, status: 'stopped' });
});

router.post('/:id/start', async (req, res) => {
  const bot = getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Not found' });
  if (!bot.container_id) return res.status(400).json({ error: 'Bot has no container to start' });

  await startContainer(bot.container_id);
  updateBot(bot.id, { status: 'running' });
  res.json({ id: bot.id, status: 'running' });
});

router.delete('/:id', async (req, res) => {
  const bot = getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Not found' });

  if (bot.container_id) await removeContainer(bot.container_id);
  deleteBot(bot.id);
  res.json({ id: bot.id, deleted: true });
});
