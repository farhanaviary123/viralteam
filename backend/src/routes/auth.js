const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Helper: SELECT user with optional playbook_link. Falls back if column not
// migrated yet (pre-v19 databases throw 42703 'undefined_column').
async function selectUser(id) {
  try {
    const { rows } = await db.query(
      'SELECT id, email, name, role, playbook_link FROM users WHERE id=$1',
      [id]
    );
    return rows[0] || null;
  } catch (err) {
    if (err.code === '42703') {
      const { rows } = await db.query(
        'SELECT id, email, name, role FROM users WHERE id=$1',
        [id]
      );
      return rows[0] || null;
    }
    throw err;
  }
}

router.post('/register', async (req, res) => {
  const { email, name, password, role, passcode } = req.body;
  if (!email || !name || !password || !role) return res.status(400).json({ error: 'All fields required' });
  if (!['strategist', 'creator'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  // Strategist signup is gated by a shared server-side passcode. The expected
  // value lives in STRATEGIST_PASSCODE on the backend env (Railway). Never
  // exposed to the client.
  if (role === 'strategist') {
    const expected = process.env.STRATEGIST_PASSCODE;
    if (!expected) return res.status(503).json({ error: 'Strategist signup not configured' });
    if (!passcode || passcode !== expected) {
      return res.status(401).json({ error: 'Invalid strategist passcode' });
    }
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      'INSERT INTO users (email, name, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, role',
      [email, name, hash, role]
    );
    const token = jwt.sign({ id: rows[0].id, role: rows[0].role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const user = await selectUser(rows[0].id);
    res.status(201).json({ user, token });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    throw err;
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const { rows } = await db.query('SELECT * FROM users WHERE email=$1', [email]);
  if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  const safeUser = await selectUser(user.id);
  res.json({ user: safeUser, token });
});

router.get('/me', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    const user = await selectUser(payload.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// PATCH /auth/me — update the signed-in user's profile (currently just
// playbook_link). Requires auth.
router.patch('/me', authenticate, async (req, res) => {
  const { playbook_link } = req.body;
  try {
    await db.query(
      'UPDATE users SET playbook_link=$1 WHERE id=$2',
      [playbook_link || null, req.user.id]
    );
  } catch (err) {
    if (err.code === '42703') {
      return res.status(503).json({ error: 'playbook_link column missing — run migrate:v19' });
    }
    throw err;
  }
  const user = await selectUser(req.user.id);
  res.json(user);
});

module.exports = router;
