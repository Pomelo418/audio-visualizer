const express = require('express');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

// Dev-only secret — a real deployment should read this from an environment variable.
const JWT_SECRET = 'audio-visualizer-dev-secret';
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.redirect('/index.html'));

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    req.userId = jwt.verify(token, JWT_SECRET).userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

function signToken(user) {
  return jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
}

// ---------- Auth ----------
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ error: 'Username required, password must be at least 6 characters' });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  try {
    const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
    const token = signToken({ id: info.lastInsertRowid });
    res.json({ token, username });
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'That username is already taken' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  res.json({ token: signToken(user), username: user.username });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'User no longer exists' });
  res.json({ username: user.username });
});

// ---------- Playlists ----------
function ownedPlaylist(id, userId) {
  return db.prepare('SELECT * FROM playlists WHERE id = ? AND user_id = ?').get(id, userId);
}

app.get('/api/playlists', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.name, COUNT(t.id) AS trackCount
    FROM playlists p
    LEFT JOIN playlist_tracks t ON t.playlist_id = p.id
    WHERE p.user_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(req.userId);
  res.json(rows);
});

app.post('/api/playlists', requireAuth, (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Playlist name required' });
  const info = db.prepare('INSERT INTO playlists (user_id, name) VALUES (?, ?)').run(req.userId, name.trim());
  res.json({ id: info.lastInsertRowid, name: name.trim(), trackCount: 0 });
});

app.get('/api/playlists/:id', requireAuth, (req, res) => {
  const playlist = ownedPlaylist(req.params.id, req.userId);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  const tracks = db.prepare(
    'SELECT id, title, artist, preview_url AS previewUrl, genre FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC'
  ).all(playlist.id);
  res.json({ id: playlist.id, name: playlist.name, tracks });
});

app.delete('/api/playlists/:id', requireAuth, (req, res) => {
  const playlist = ownedPlaylist(req.params.id, req.userId);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(playlist.id);
  db.prepare('DELETE FROM playlists WHERE id = ?').run(playlist.id);
  res.json({ ok: true });
});

app.post('/api/playlists/:id/tracks', requireAuth, (req, res) => {
  const playlist = ownedPlaylist(req.params.id, req.userId);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  const { title, artist, previewUrl, genre } = req.body || {};
  if (!title || !artist || !previewUrl) return res.status(400).json({ error: 'Missing track fields' });
  // MAX(position)+1 rather than COUNT(*): COUNT drops after a removal, which collided new
  // tracks into an already-used position and made playback order undefined past that point.
  const { maxPosition } = db.prepare('SELECT MAX(position) AS maxPosition FROM playlist_tracks WHERE playlist_id = ?').get(playlist.id);
  const nextPosition = (maxPosition ?? -1) + 1;
  const info = db.prepare(
    'INSERT INTO playlist_tracks (playlist_id, position, title, artist, preview_url, genre) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(playlist.id, nextPosition, title, artist, previewUrl, genre || null);
  res.json({ id: info.lastInsertRowid, title, artist, previewUrl, genre });
});

app.delete('/api/playlists/:id/tracks/:trackRowId', requireAuth, (req, res) => {
  const playlist = ownedPlaylist(req.params.id, req.userId);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  db.prepare('DELETE FROM playlist_tracks WHERE id = ? AND playlist_id = ?').run(req.params.trackRowId, playlist.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Audio visualizer running at http://localhost:${PORT}`);
});
