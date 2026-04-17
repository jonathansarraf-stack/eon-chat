'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('./db');

const router = express.Router();

// ── Password helpers ────────────────────────────────────────────────────────

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(salt + ':' + key.toString('hex'));
    });
  });
}

function verifyPassword(password, hash) {
  return new Promise((resolve, reject) => {
    const [salt, stored] = hash.split(':');
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString('hex') === stored);
    });
  });
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── Ensure default admin exists ─────────────────────────────────────────────

async function ensureAdmin() {
  const existing = db.prepare('SELECT id FROM admin_users LIMIT 1').get();
  if (!existing) {
    const hash = await hashPassword(process.env.ADMIN_PASSWORD || 'eon2026admin');
    db.prepare('INSERT INTO admin_users (email, password_hash, name) VALUES (?, ?, ?)')
      .run('admin@eon.chat', hash, 'Jonathan');
    console.log('[admin] Default admin created: admin@eon.chat');
  }
}

// ── Auth middleware ──────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const token = req.cookies?.eon_admin || req.headers['x-admin-token'];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const session = db.prepare(
    'SELECT s.admin_id, u.email, u.name FROM admin_sessions s JOIN admin_users u ON u.id = s.admin_id WHERE s.token = ? AND s.expires_at > ?'
  ).get(token, Math.floor(Date.now() / 1000));

  if (!session) return res.status(401).json({ error: 'Session expired' });

  req.admin = session;
  next();
}

// ── Login ───────────────────────────────────────────────────────────────────

router.post('/login', express.json(), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = generateToken();
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 3600; // 7 days

  db.prepare('INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES (?, ?, ?)')
    .run(token, user.id, expiresAt);

  // Clean old sessions
  db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?')
    .run(Math.floor(Date.now() / 1000));

  res.cookie('eon_admin', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 3600 * 1000,
    path: '/',
  });

  res.json({ ok: true, name: user.name, email: user.email });
});

router.post('/logout', (req, res) => {
  const token = req.cookies?.eon_admin;
  if (token) {
    db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
  }
  res.clearCookie('eon_admin', { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAdmin, (req, res) => {
  res.json({ email: req.admin.email, name: req.admin.name });
});

// ── Dashboard stats ─────────────────────────────────────────────────────────

router.get('/stats', requireAdmin, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM licenses').get().c;
  const active = db.prepare("SELECT COUNT(*) as c FROM licenses WHERE status = 'active'").get().c;
  const cancelled = db.prepare("SELECT COUNT(*) as c FROM licenses WHERE status = 'cancelled'").get().c;
  const expired = db.prepare("SELECT COUNT(*) as c FROM licenses WHERE status = 'expired'").get().c;
  const trial = db.prepare("SELECT COUNT(*) as c FROM licenses WHERE status = 'trial'").get().c;

  // Revenue estimate (active paying plans * $9, exclude free)
  const paying = db.prepare("SELECT COUNT(*) as c FROM licenses WHERE status = 'active' AND plan != 'free'").get().c;
  const free = db.prepare("SELECT COUNT(*) as c FROM licenses WHERE status = 'active' AND plan = 'free'").get().c;
  const mrr = paying * 9;

  // Recent activity
  const recentSignups = db.prepare(
    'SELECT COUNT(*) as c FROM licenses WHERE created_at > ?'
  ).get(Math.floor(Date.now() / 1000) - 7 * 24 * 3600).c;

  const recentVerifications = db.prepare(
    'SELECT COUNT(*) as c FROM licenses WHERE last_verified_at > ?'
  ).get(Math.floor(Date.now() / 1000) - 24 * 3600).c;

  res.json({
    total,
    active,
    cancelled,
    expired,
    trial,
    mrr,
    paying,
    free,
    recentSignups,
    recentVerifications,
  });
});

// ── Licenses CRUD ───────────────────────────────────────────────────────────

router.get('/licenses', requireAdmin, (req, res) => {
  const { status, plan, search, limit = 50, offset = 0 } = req.query;

  let sql = 'SELECT * FROM licenses WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  if (plan) {
    sql += ' AND plan = ?';
    params.push(plan);
  }

  if (search) {
    sql += ' AND (email LIKE ? OR key LIKE ? OR note LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const licenses = db.prepare(sql).all(...params);
  const count = db.prepare(
    'SELECT COUNT(*) as c FROM licenses' + (status ? " WHERE status = '" + status + "'" : '')
  ).get().c;

  res.json({ licenses, total: count });
});

router.patch('/licenses/:id', requireAdmin, express.json(), (req, res) => {
  const { status, plan, email } = req.body;
  const id = req.params.id;

  const license = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id);
  if (!license) return res.status(404).json({ error: 'Not found' });

  if (status) db.prepare('UPDATE licenses SET status = ? WHERE id = ?').run(status, id);
  if (plan) db.prepare('UPDATE licenses SET plan = ? WHERE id = ?').run(plan, id);
  if (email) db.prepare('UPDATE licenses SET email = ? WHERE id = ?').run(email, id);

  res.json({ ok: true });
});

router.delete('/licenses/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM licenses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Create manual license (supports free/trial with expiry)
router.post('/licenses', requireAdmin, express.json(), (req, res) => {
  const { email, plan = 'pro', note, expiresInDays } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const key = `eon_${crypto.randomBytes(24).toString('hex')}`;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = expiresInDays ? now + expiresInDays * 24 * 3600 : null;

  db.prepare(
    'INSERT INTO licenses (key, email, plan, status, created_at, expires_at, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(key, email, plan, 'active', now, expiresAt, note || null);

  res.json({ key, email, plan, expiresAt });
});

// ── Change password ─────────────────────────────────────────────────────────

router.post('/change-password', requireAdmin, express.json(), async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Min 6 chars' });

  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.admin_id);
  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password wrong' });

  const hash = await hashPassword(newPassword);
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, user.id);

  res.json({ ok: true });
});

module.exports = { router, ensureAdmin, requireAdmin };
