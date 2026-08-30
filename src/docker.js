import Docker from 'dockerode';
import simpleGit from 'simple-git';
import fs from 'fs';
import path from 'path';
import tar from 'tar-fs';
import 'dotenv/config';

export const docker = new Docker(); // connects to /var/run/docker.sock by default

const dataDir = process.env.DATA_DIR || './data';
const botsDir = path.join(dataDir, 'bots');
fs.mkdirSync(botsDir, { recursive: true });

const MEMORY_BYTES = (Number(process.env.BOT_MEMORY_MB) || 256) * 1024 * 1024;
const CPU_QUOTA = Math.round((Number(process.env.BOT_CPUS) || 0.5) * 100000);

// Fallback Dockerfile used when the target repo doesn't ship its own.
// Assumes a standard Node.js bot with a package.json start script.
const GENERIC_DOCKERFILE = `
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
CMD ["npm", "start"]
`.trim();

export function repoPath(botId) {
  return path.join(botsDir, botId);
}

export async function cloneRepo(botId, repoUrl, branch) {
  const dest = repoPath(botId);
  fs.rmSync(dest, { recursive: true, force: true });
  const git = simpleGit();
  await git.clone(repoUrl, dest, ['--depth', '1', '--branch', branch]);

  const dockerfilePath = path.join(dest, 'Dockerfile');
  if (!fs.existsSync(dockerfilePath)) {
    fs.writeFileSync(dockerfilePath, GENERIC_DOCKERFILE);
  }
  return dest;
}

export async function buildImage(botId, buildDir, onLog) {
  const imageTag = `bot-${botId}:latest`;
  const tarStream = tar.pack(buildDir);
  const stream = await docker.buildImage(tarStream, { t: imageTag });

  await new Promise((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err, res) => (err ? reject(err) : resolve(res)),
      (event) => {
        if (event.stream && onLog) onLog(event.stream.trim());
        if (event.error) reject(new Error(event.error));
      }
    );
  });

  return imageTag;
}

export async function runContainer(botId, imageTag) {
  const containerName = `bot-${botId}`;

  // Remove any stale container with the same name from a previous deploy.
  try {
    const existing = docker.getContainer(containerName);
    await existing.remove({ force: true });
  } catch (_) {
    /* no existing container, fine */
  }

  const container = await docker.createContainer({
    name: containerName,
    Image: imageTag,
    Labels: { platform: 'bot-hosting', botId },
    HostConfig: {
      Memory: MEMORY_BYTES,
      CpuPeriod: 100000,
      CpuQuota: CPU_QUOTA,
      RestartPolicy: { Name: 'unless-stopped' },
      LogConfig: { Type: 'json-file', Config: { 'max-size': '10m', 'max-file': '3' } },
    },
  });

  await container.start();
  return { containerId: container.id, containerName };
}

export async function stopContainer(containerId) {
  const container = docker.getContainer(containerId);
  await container.stop({ t: 5 }).catch(() => {}); // ignore "already stopped"
}

export async function startContainer(containerId) {
  const container = docker.getContainer(containerId);
  await container.start();
}

export async function removeContainer(containerId) {
  const container = docker.getContainer(containerId);
  await container.remove({ force: true }).catch(() => {});
}

export async function getContainerStatus(containerId) {
  try {
    const info = await docker.getContainer(containerId).inspect();
    return info.State.Running ? 'running' : 'stopped';
  } catch (_) {
    return 'unknown';
  }
}

// Streams live logs from a container. onData receives decoded chunks of text.
export async function streamLogs(containerId, onData) {
  const container = docker.getContainer(containerId);
  const stream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 100,
  });
  container.modem.demuxStream(
    stream,
    { write: (chunk) => onData(chunk.toString('utf8')) },
    { write: (chunk) => onData(chunk.toString('utf8')) }
  );
  return stream; // caller can call stream.destroy() to stop following
}
