const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM vibes ORDER BY name ASC');
  res.json(rows);
});

router.post('/', requireRole('strategist'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const { rows } = await db.query(
      'INSERT INTO vibes (name) VALUES ($1) RETURNING *',
      [name.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Vibe already exists' });
    throw err;
  }
});

router.patch('/:id', requireRole('strategist'), async (req, res) => {
  const { name } = req.body;
  const { rows } = await db.query(
    'UPDATE vibes SET name = COALESCE($1, name) WHERE id=$2 RETURNING *',
    [name, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/:id', requireRole('strategist'), async (req, res) => {
  const id = req.params.id;
  console.log(`[vibes] DELETE id=${id} by user=${req.user?.id}`);
  // Guard against non-UUID input (otherwise pg throws 22P02 → 500)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: `Invalid vibe id: ${id}` });
  }
  try {
    const { rowCount } = await db.query('DELETE FROM vibes WHERE id=$1', [id]);
    if (!rowCount) {
      console.warn(`[vibes] DELETE id=${id} → 0 rows (already deleted or stale id)`);
      return res.status(404).json({ error: 'Vibe not found (may already be deleted — refresh the page)' });
    }
    res.json({ deleted: id });
  } catch (err) {
    console.error(`[vibes] DELETE id=${id} failed:`, err);
    res.status(500).json({ error: err.message || 'Delete failed' });
  }
});

module.exports = router;
