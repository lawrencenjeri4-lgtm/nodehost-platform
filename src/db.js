import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';

const dataDir = process.env.DATA_DIR || './data';
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'platform.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS bots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    repo_url TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    container_id TEXT,
    container_name TEXT,
    image_tag TEXT,
    status TEXT NOT NULL DEFAULT 'created', -- created | building | running | stopped | failed
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export function insertBot(bot) {
  db.prepare(
    `INSERT INTO bots (id, name, repo_url, branch, status) VALUES (@id, @name, @repo_url, @branch, @status)`
  ).run(bot);
}

export function updateBot(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE bots SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({
    id,
    ...fields,
  });
}

export function getBot(id) {
  return db.prepare('SELECT * FROM bots WHERE id = ?').get(id);
}

export function listBots() {
  return db.prepare('SELECT * FROM bots ORDER BY created_at DESC').all();
}

export function deleteBot(id) {
  db.prepare('DELETE FROM bots WHERE id = ?').run(id);
}
