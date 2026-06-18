const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/guide-content — any authenticated user (creator wizard reads it).
// Returns the single guide_content row's `data` JSON, or {} if the table is
// empty / not yet migrated.
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT data FROM guide_content WHERE id = 1');
    res.json(rows[0]?.data || {});
  } catch (err) {
    if (err.code === '42P01') {
      console.warn('[guide-content GET] guide_content missing — run migrate:v21');
      return res.json({});
    }
    throw err;
  }
});

// GET /api/guide-content/picks — random copy lines + songs for the Guide
// wizard. Any authenticated user. Self-contained (no vibe joins) so it works
// regardless of which optional tables exist. Returns shuffled active rows.
router.get('/picks', async (req, res) => {
  let copy_lines = [];
  let songs = [];
  // No status filter — fetch every row, shuffled. Skip archived copy lines
  // (soft-deleted) when that column exists.
  try {
    const r = await db.query(
      "SELECT id, copy_text FROM copy_lines WHERE archived = false ORDER BY random()"
    );
    copy_lines = r.rows;
  } catch (err) {
    if (err.code === '42703') {
      // archived column missing — fetch all.
      const r = await db.query('SELECT id, copy_text FROM copy_lines ORDER BY random()');
      copy_lines = r.rows;
    } else if (err.code !== '42P01') {
      throw err; // table missing → empty list
    }
  }
  try {
    const r = await db.query('SELECT id, name, link, tiktok_link FROM songs ORDER BY random()');
    songs = r.rows;
  } catch (err) {
    if (err.code === '42703') {
      // tiktok_link column missing — retry without it.
      const r = await db.query('SELECT id, name, link FROM songs ORDER BY random()');
      songs = r.rows;
    } else if (err.code !== '42P01') {
      throw err; // table missing → empty list
    }
  }
  res.json({ copy_lines, songs });
});

// PATCH /api/guide-content — strategist-only. Replaces the whole content blob.
// The editor sends the full object back, so a straight upsert is simplest.
router.patch('/', requireRole('strategist'), async (req, res) => {
  const data = req.body;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'Body must be a content object' });
  }
  try {
    await db.query(
      `INSERT INTO guide_content (id, data, updated_at)
         VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()`,
      [JSON.stringify(data)]
    );
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ error: 'guide_content missing — run migrate:v21' });
    }
    throw err;
  }
  res.json(data);
});

module.exports = router;
