import { createServer } from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import Database from 'better-sqlite3';
import StompServer from 'stomp-broker-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(__dirname, 'editor.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    review_token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS asset_versions (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    author TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(asset_id, version_number)
  );
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    version_id TEXT REFERENCES asset_versions(id) ON DELETE SET NULL,
    author TEXT NOT NULL,
    text TEXT NOT NULL,
    x REAL,
    y REAL,
    created_at TEXT NOT NULL
  );
`);

const httpServer = createServer();
const stompServer = new StompServer({ server: httpServer });
const app = express();
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

function broadcast(projectId, payload) {
  stompServer.send(
    `/topic/editor/project/${projectId}/events`,
    { 'content-type': 'application/json' },
    JSON.stringify({ ...payload, timestamp: now() }),
  );
}

function getProjectPayload(projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return null;
  const folders = db.prepare('SELECT * FROM folders WHERE project_id = ? ORDER BY created_at').all(projectId);
  const assets = db
    .prepare('SELECT * FROM assets WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId)
    .map((asset) => {
      const versions = db
        .prepare('SELECT * FROM asset_versions WHERE asset_id = ? ORDER BY version_number')
        .all(asset.id)
        .map((v) => ({ ...v, url: `/uploads/${path.basename(v.file_path)}` }));
      return { ...asset, versions, latestVersionId: versions.at(-1)?.id ?? null };
    });
  return { project, folders, assets };
}

// ---------- Legacy global chat (kept for / route) ----------
stompServer.on('connecting', (sessionId) => {
  console.log(`[STOMP] Client connecting: ${sessionId}`);
});
stompServer.on('disconnected', (sessionId) => {
  console.log(`[STOMP] Client disconnected: ${sessionId}`);
});
stompServer.subscribe('/app/chat', (msg) => {
  const payload = typeof msg === 'string' ? JSON.parse(msg) : msg;
  const enrichedMessage = {
    id: crypto.randomUUID(),
    text: payload?.text ?? '',
    sender: payload?.sender ?? '',
    timestamp: now(),
  };
  stompServer.send('/topic/chat', { 'content-type': 'application/json' }, JSON.stringify(enrichedMessage));
});

// ---------- Editor chat relay: /app/editor/chat -> /topic/editor/project/:id/chat ----------
stompServer.subscribe('/app/editor/chat', (msg) => {
  const payload = typeof msg === 'string' ? JSON.parse(msg) : msg;
  if (!payload?.projectId) return;
  const chatMessage = {
    id: uid(),
    author: payload?.author ?? 'Anonymous',
    text: payload?.text ?? '',
    timestamp: now(),
  };
  stompServer.send(
    `/topic/editor/project/${payload.projectId}/chat`,
    { 'content-type': 'application/json' },
    JSON.stringify(chatMessage),
  );
});

// ---------- REST API ----------
const api = express.Router();

api.get('/projects', (_req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  const counts = db.prepare('SELECT project_id, COUNT(*) AS c FROM assets GROUP BY project_id').all();
  const countMap = Object.fromEntries(counts.map((r) => [r.project_id, r.c]));
  res.json(projects.map((p) => ({ ...p, assetCount: countMap[p.id] ?? 0 })));
});

api.post('/projects', (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const project = { id: uid(), name, review_token: uid(), created_at: now() };
  db.prepare('INSERT INTO projects (id, name, review_token, created_at) VALUES (?, ?, ?, ?)').run(
    project.id,
    project.name,
    project.review_token,
    project.created_at,
  );
  res.status(201).json(project);
});

api.get('/projects/:id', (req, res) => {
  const payload = getProjectPayload(req.params.id);
  if (!payload) return res.status(404).json({ error: 'Project not found' });
  res.json(payload);
});

api.post('/projects/:id/folders', (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const parentId = req.body?.parentId ?? null;
  if (parentId && !db.prepare('SELECT id FROM folders WHERE id = ? AND project_id = ?').get(parentId, req.params.id)) {
    return res.status(400).json({ error: 'Invalid parent folder' });
  }
  const folder = { id: uid(), project_id: req.params.id, parent_id: parentId, name, created_at: now() };
  db.prepare('INSERT INTO folders (id, project_id, parent_id, name, created_at) VALUES (?, ?, ?, ?, ?)').run(
    folder.id,
    folder.project_id,
    folder.parent_id,
    folder.name,
    folder.created_at,
  );
  broadcast(req.params.id, { type: 'folders-changed' });
  res.status(201).json(folder);
});

api.delete('/folders/:id', (req, res) => {
  const folder = db.prepare('SELECT project_id FROM folders WHERE id = ?').get(req.params.id);
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  db.prepare('UPDATE assets SET folder_id = NULL WHERE folder_id = ?').run(req.params.id);
  db.prepare('DELETE FROM folders WHERE id = ?').run(req.params.id);
  broadcast(folder.project_id, { type: 'folders-changed' });
  res.status(204).end();
});

function saveVersion(req, assetId, author) {
  if (!req.file) return null;
  const next =
    (db.prepare('SELECT COALESCE(MAX(version_number), 0) AS v FROM asset_versions WHERE asset_id = ?').get(assetId)?.v ?? 0) + 1;
  const version = {
    id: uid(),
    asset_id: assetId,
    version_number: next,
    file_path: req.file.path,
    original_name: req.file.originalname,
    mime_type: req.file.mimetype,
    size: req.file.size,
    status: 'pending',
    author: String(author ?? ''),
    created_at: now(),
  };
  db.prepare(
    `INSERT INTO asset_versions (id, asset_id, version_number, file_path, original_name, mime_type, size, status, author, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    version.id,
    version.asset_id,
    version.version_number,
    version.file_path,
    version.original_name,
    version.mime_type,
    version.size,
    version.status,
    version.author,
    version.created_at,
  );
  return version;
}

api.post('/projects/:id/assets', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const name = String(req.body?.name ?? '').trim() || req.file.originalname;
  const folderId = req.body?.folderId ?? null;
  if (folderId && !db.prepare('SELECT id FROM folders WHERE id = ? AND project_id = ?').get(folderId, req.params.id)) {
    return res.status(400).json({ error: 'Invalid folder' });
  }
  const asset = { id: uid(), project_id: req.params.id, folder_id: folderId, name, created_at: now() };
  db.prepare('INSERT INTO assets (id, project_id, folder_id, name, created_at) VALUES (?, ?, ?, ?, ?)').run(
    asset.id,
    asset.project_id,
    asset.folder_id,
    asset.name,
    asset.created_at,
  );
  saveVersion(req, asset.id, req.body?.author);
  broadcast(req.params.id, { type: 'assets-changed' });
  res.status(201).json(getProjectPayload(req.params.id));
});

api.post('/assets/:id/versions', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  saveVersion(req, asset.id, req.body?.author);
  broadcast(asset.project_id, { type: 'assets-changed' });
  res.status(201).json(getProjectPayload(asset.project_id));
});

api.post('/versions/:id/review', (req, res) => {
  const status = String(req.body?.status ?? '');
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved, rejected or pending' });
  }
  const version = db.prepare('SELECT * FROM asset_versions WHERE id = ?').get(req.params.id);
  if (!version) return res.status(404).json({ error: 'Version not found' });
  db.prepare('UPDATE asset_versions SET status = ? WHERE id = ?').run(status, version.id);
  const asset = db.prepare('SELECT project_id FROM assets WHERE id = ?').get(version.asset_id);
  broadcast(asset.project_id, { type: 'assets-changed' });
  res.json({ ok: true });
});

api.get('/assets/:id/comments', (req, res) => {
  res.json(db.prepare('SELECT * FROM comments WHERE asset_id = ? ORDER BY created_at').all(req.params.id));
});

api.post('/assets/:id/comments', (req, res) => {
  const text = String(req.body?.text ?? '').trim();
  const author = String(req.body?.author ?? '').trim() || 'Anonymous';
  if (!text) return res.status(400).json({ error: 'text is required' });
  const asset = db.prepare('SELECT project_id FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  const comment = {
    id: uid(),
    asset_id: req.params.id,
    version_id: req.body?.versionId ?? null,
    author,
    text,
    x: req.body?.x ?? null,
    y: req.body?.y ?? null,
    created_at: now(),
  };
  db.prepare('INSERT INTO comments (id, asset_id, version_id, author, text, x, y, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    comment.id,
    comment.asset_id,
    comment.version_id,
    comment.author,
    comment.text,
    comment.x,
    comment.y,
    comment.created_at,
  );
  broadcast(asset.project_id, { type: 'comments-changed', assetId: req.params.id });
  res.status(201).json(comment);
});

api.delete('/assets/:id', (req, res) => {
  const asset = db.prepare('SELECT project_id FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
  broadcast(asset.project_id, { type: 'assets-changed' });
  res.status(204).end();
});

// Public review payload by token
api.get('/review/:token', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE review_token = ?').get(req.params.token);
  if (!project) return res.status(404).json({ error: 'Review link not found' });
  res.json(getProjectPayload(project.id));
});

api.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err instanceof multer.MulterError ? 413 : 500).json({ error: err.message ?? 'Server error' });
});

app.use('/api/editor', api);

// Express handles non-STOMP HTTP; STOMP endpoint stays on the same server.
httpServer.on('request', (req, res) => {
  if (req.url?.startsWith('/stomp')) return; // let stomp-broker-js handle it
  app(req, res);
});

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`API + STOMP server running on http://localhost:${PORT}`);
  console.log(`  REST:  http://localhost:${PORT}/api/editor`);
  console.log(`  STOMP: ws://localhost:${PORT}/stomp`);
  console.log(`  Files: http://localhost:${PORT}/uploads`);
});
