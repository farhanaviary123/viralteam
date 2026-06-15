// Products (v12) — what a creator is selling in the concept.
// Used as a filter when randomising copy_lines and clips.
//
// GET    /api/products
// POST   /api/products              { name, image_url? }
// PATCH  /api/products/:id          { name?, image_url?, status? }
// DELETE /api/products/:id          (hard delete; nullifies references)

const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, name, image_url, status, created_at
       FROM products ORDER BY created_at DESC`
  );
  res.json(rows);
});

router.post('/', requireRole('strategist'), async (req, res) => {
  const { name, image_url = null, status = 'active' } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const { rows } = await db.query(
    `INSERT INTO products (name, image_url, status)
     VALUES ($1, $2, $3) RETURNING *`,
    [name.trim(), image_url || null, status]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', requireRole('strategist'), async (req, res) => {
  const { name, image_url, status } = req.body;
  const { rows } = await db.query(`
    UPDATE products SET
      name      = COALESCE($1, name),
      image_url = COALESCE($2, image_url),
      status    = COALESCE($3, status)
    WHERE id=$4 RETURNING *
  `, [name, image_url, status, req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/:id', requireRole('strategist'), async (req, res) => {
  const r = await db.query('DELETE FROM products WHERE id=$1 RETURNING id', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: r.rows[0].id });
});

module.exports = router;
