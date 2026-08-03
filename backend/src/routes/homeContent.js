const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/home-content — any authenticated user (creator Home reads it).
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT data FROM home_screen_content WHERE id = 1');
    res.json(rows[0]?.data || {});
  } catch (err) {
    if (err.code === '42P01') {
      console.warn('[home-content GET] home_screen_content missing — run migrate:v27');
      return res.json({});
    }
    throw err;
  }
});

// PATCH /api/home-content — strategist-only.
router.patch('/', requireRole('strategist'), async (req, res) => {
  const data = req.body;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'Body must be a content object' });
  }
  try {
    await db.query(
      `INSERT INTO home_screen_content (id, data, updated_at)
         VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()`,
      [JSON.stringify(data)]
    );
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ error: 'home_screen_content missing — run migrate:v27' });
    }
    throw err;
  }
  res.json(data);
});

module.exports = router;
