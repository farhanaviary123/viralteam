// Clip examples — N media examples per clip, oldest = primary in the UI.
//
// Routes:
//   GET    /api/clips/:clipId/examples
//   POST   /api/clips/:clipId/examples         body: { url, label? }
//   DELETE /api/clip-examples/:id

const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/clips/:clipId/examples', async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, clip_id, url, label, created_at
       FROM clip_examples
      WHERE clip_id = $1
      ORDER BY created_at ASC`,
    [req.params.clipId]
  );
  res.json(rows);
});

router.post('/clips/:clipId/examples', requireRole('strategist'), async (req, res) => {
  const { url, label } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO clip_examples (clip_id, url, label)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.clipId, url, label || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[clipExamples POST] failed', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/clip-examples/:id', requireRole('strategist'), async (req, res) => {
  const r = await db.query(
    'DELETE FROM clip_examples WHERE id=$1 RETURNING id',
    [req.params.id]
  );
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: req.params.id });
});

module.exports = router;
