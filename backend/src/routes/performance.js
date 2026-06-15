const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('strategist'));

router.get('/', async (req, res) => {
  const { rows } = await db.query(`
    SELECT pe.*, cp.title AS concept_title, a.name AS angle_name, f.name AS format_name
    FROM performance_entries pe
    JOIN concept_projects cp ON cp.id = pe.concept_id
    JOIN angles a ON a.id = cp.angle_id
    JOIN formats f ON f.id = cp.format_id
    ORDER BY pe.created_at DESC
  `);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { concept_id, platform, views = 0, clicks = 0, conversions = 0, notes } = req.body;
  if (!concept_id) return res.status(400).json({ error: 'concept_id required' });
  const { rows } = await db.query(
    'INSERT INTO performance_entries (concept_id, platform, views, clicks, conversions, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [concept_id, platform, views, clicks, conversions, notes]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const { platform, views, clicks, conversions, notes } = req.body;
  const { rows } = await db.query(`
    UPDATE performance_entries SET
      platform = COALESCE($1, platform),
      views = COALESCE($2, views),
      clicks = COALESCE($3, clicks),
      conversions = COALESCE($4, conversions),
      notes = COALESCE($5, notes)
    WHERE id=$6 RETURNING *
  `, [platform, views, clicks, conversions, notes, req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

module.exports = router;
