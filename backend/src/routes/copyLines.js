const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { setVibes, attachVibes } = require('../lib/vibes');

const router = express.Router();
router.use(authenticate);

// v20: filter archived rows from strategist-facing lists.
async function selectByAngle(angleId, extraWhere = '', extraParams = []) {
  const params = [angleId, ...extraParams];
  try {
    const { rows } = await db.query(
      `SELECT * FROM copy_lines WHERE angle_id=$1 AND COALESCE(archived, FALSE) = FALSE ${extraWhere} ORDER BY created_at ASC`,
      params
    );
    return rows;
  } catch (err) {
    if (err.code !== '42703') throw err;
    const { rows } = await db.query(
      `SELECT * FROM copy_lines WHERE angle_id=$1 ${extraWhere} ORDER BY created_at ASC`,
      params
    );
    return rows;
  }
}

// v20: flat list of archived copy lines for the strategist archive view.
// Includes parent angle name so the UI can label rows. Returns [] on pre-v20.
router.get('/archived', requireRole('strategist'), async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT cl.*, a.name AS angle_name
      FROM copy_lines cl
      JOIN angles a ON a.id = cl.angle_id
      WHERE COALESCE(cl.archived, FALSE) = TRUE
      ORDER BY cl.updated_at DESC NULLS LAST, cl.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    if (err.code === '42703') return res.json([]);
    throw err;
  }
});

// GET /api/copy-lines/random?limit=5 — any authenticated user.
// Returns up to `limit` random active, non-archived copy lines, ignoring angle.
// Used by the creator Guide wizard (Step 2) to surface ready-to-use headlines.
// Returns [] when the table is empty so the wizard renders gracefully.
router.get('/random', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);
  try {
    const { rows } = await db.query(
      `SELECT * FROM copy_lines
         WHERE archived = FALSE
         ORDER BY random()
         LIMIT $1`,
      [limit]
    );
    return res.json(rows);
  } catch (err) {
    // Pre-v20 (no archived column) — fall back without the archived filter.
    if (err.code === '42703') {
      const { rows } = await db.query(
        `SELECT * FROM copy_lines WHERE archived = FALSE ORDER BY random() LIMIT $1`,
        [limit]
      );
      return res.json(rows);
    }
    if (err.code === '42P01') return res.json([]); // table not yet migrated
    throw err;
  }
});

router.get('/by-angle/:angleId', async (req, res) => {
  const rows = await selectByAngle(req.params.angleId);
  const withVibes = await attachVibes(rows, 'copy_line_vibes', 'copy_line_id');
  res.json(withVibes);
});

router.get('/by-angle/:angleId/type/:copyType', async (req, res) => {
  const rows = await selectByAngle(req.params.angleId, "AND copy_type=$2 AND archived = FALSE", [req.params.copyType]);
  const withVibes = await attachVibes(rows, 'copy_line_vibes', 'copy_line_id');
  res.json(withVibes);
});

router.post('/', requireRole('strategist'), async (req, res) => {
  const {
    angle_id, copy_text, copy_type,
    priority_weight = 3, all_vibes = false, vibe_ids = [],
    product_ids = [],
  } = req.body;
  if (!angle_id || !copy_text || !copy_type) return res.status(400).json({ error: 'angle_id, copy_text, and copy_type required' });

  const { rows } = await db.query(
    `INSERT INTO copy_lines (angle_id, copy_text, copy_type, priority_weight, all_vibes, product_ids)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [angle_id, copy_text, copy_type, priority_weight, all_vibes, Array.isArray(product_ids) ? product_ids : []]
  );
  await setVibes('copy_line_vibes', 'copy_line_id', rows[0].id, vibe_ids);
  const [withVibes] = await attachVibes(rows, 'copy_line_vibes', 'copy_line_id');
  res.status(201).json(withVibes);
});

router.patch('/:id', requireRole('strategist'), async (req, res) => {
  const { copy_text, copy_type, status, priority_weight, all_vibes, vibe_ids, product_ids, archived } = req.body;
  let rows;
  try {
    ({ rows } = await db.query(`
      UPDATE copy_lines SET
        copy_text = COALESCE($1, copy_text),
        copy_type = COALESCE($2, copy_type),
        status = COALESCE($3, status),
        priority_weight = COALESCE($4, priority_weight),
        all_vibes = COALESCE($5, all_vibes),
        product_ids = COALESCE($6, product_ids),
        archived = COALESCE($7, archived),
        updated_at = now()
      WHERE id=$8 RETURNING *
    `, [
      copy_text, copy_type, status, priority_weight, all_vibes,
      product_ids === undefined ? null : (Array.isArray(product_ids) ? product_ids : []),
      archived,
      req.params.id,
    ]));
  } catch (err) {
    if (err.code === '42703' && archived !== undefined) {
      return res.status(503).json({ error: 'archived column missing — run migrate:v20' });
    }
    throw err;
  }
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (vibe_ids !== undefined) {
    await setVibes('copy_line_vibes', 'copy_line_id', req.params.id, vibe_ids);
  }
  const [withVibes] = await attachVibes(rows, 'copy_line_vibes', 'copy_line_id');
  res.json(withVibes);
});

// v20: hard delete removed — strategist now archives via PATCH { archived: true }.

module.exports = router;
