const express = require('express');
const path = require('path');
const fs = require('fs');

// ── Minimal .env loader (local dev only; Vercel injects env vars itself) ──
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, 'frontend');

// ── API routes (same handlers Vercel deploys from /api) ───────────────
app.post('/api/chat', express.json({ limit: '64kb' }), require('./api/chat'));

// ── Clean-URL rewrites (mirrors vercel.json) ──────────────────────────
const rewrites = {
  '/dashboard': '/dashboard.html',
  '/transactions': '/transactions.html',
  '/analytics': '/analytics.html',
  '/profile': '/profile.html',
  '/login': '/login.html',
  '/register': '/register.html',
};

Object.entries(rewrites).forEach(([source, destination]) => {
  app.get(source, (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, destination));
  });
});

// ── Serve static files from frontend/ ─────────────────────────────────
app.use(express.static(FRONTEND_DIR));

// ── Fallback: serve index.html for unknown routes ─────────────────────
app.use((_req, res) => {
  res.status(404).sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  🏦  VaultWealth running at  http://localhost:${PORT}\n`);
});
