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
// Returns up to `limit` active, non-archived copy lines, ignoring angle.
// High-potential lines are surfaced first (so creators always see the ones the
// strategist flagged), then the remaining slots are filled at random. Used by
// the creator Guide wizard (Step 2). Returns [] when empty.
router.get('/random', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);
  // withHp: high_potential first, then random. Falls back through missing
  // columns (high_potential → archived) on un-migrated databases.
  try {
    const { rows } = await db.query(
      `SELECT * FROM copy_lines
         WHERE archived = FALSE
         ORDER BY high_potential DESC, random()
         LIMIT $1`,
      [limit]
    );
    return res.json(rows);
  } catch (err) {
    if (err.code !== '42703') {
      if (err.code === '42P01') return res.json([]); // table not yet migrated
      throw err;
    }
    // high_potential and/or archived column missing — degrade gracefully.
    try {
      const { rows } = await db.query(
        `SELECT * FROM copy_lines WHERE archived = FALSE ORDER BY random() LIMIT $1`,
        [limit]
      );
      return res.json(rows);
    } catch (err2) {
      if (err2.code === '42P01') return res.json([]);
      if (err2.code !== '42703') throw err2;
      const { rows } = await db.query('SELECT * FROM copy_lines ORDER BY random() LIMIT $1', [limit]);
      return res.json(rows);
    }
  }
});

// GET /api/copy-lines/grouped — any authenticated user.
// Returns active, non-archived copy lines grouped by their angle:
//   [{ angle_id, angle_name, lines: [{ id, copy_text, copy_type }] }, ...]
// Used by the creator Guide "See all headlines" popup. Angles with no active
// lines are omitted. Returns [] when nothing matches / table not yet migrated.
router.get('/grouped', async (req, res) => {
  // hp: whether the high_potential column exists (v25). When it does, select
  // it and pin high-potential lines to the top of each angle group.
  const sql = ({ withArchived, withHp }) => `
    SELECT a.id AS angle_id, a.name AS angle_name,
           cl.id, cl.copy_text, cl.copy_type${withHp ? ', cl.high_potential' : ''}
    FROM copy_lines cl
    JOIN angles a ON a.id = cl.angle_id
    WHERE cl.status = 'active' ${withArchived ? 'AND COALESCE(cl.archived, FALSE) = FALSE' : ''}
    ORDER BY a.priority_weight DESC, a.created_at ASC,
             ${withHp ? 'cl.high_potential DESC,' : ''} cl.created_at ASC
  `;
  let rows, withHp = true;
  try {
    ({ rows } = await db.query(sql({ withArchived: true, withHp: true })));
  } catch (err) {
    if (err.code === '42P01') return res.json([]); // table not yet migrated
    if (err.code !== '42703') throw err;
    // Missing archived and/or high_potential columns — retry conservatively.
    withHp = false;
    try {
      ({ rows } = await db.query(sql({ withArchived: true, withHp: false })));
    } catch (err2) {
      if (err2.code !== '42703') throw err2;
      ({ rows } = await db.query(sql({ withArchived: false, withHp: false })));
    }
  }
  // Fold the flat rows into angle groups, preserving the ORDER BY ordering.
  const groups = [];
  const byAngle = new Map();
  for (const r of rows) {
    let g = byAngle.get(r.angle_id);
    if (!g) {
      g = { angle_id: r.angle_id, angle_name: r.angle_name, lines: [] };
      byAngle.set(r.angle_id, g);
      groups.push(g);
    }
    g.lines.push({ id: r.id, copy_text: r.copy_text, copy_type: r.copy_type, high_potential: withHp ? !!r.high_potential : false });
  }
  res.json(groups);
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
    product_ids = [], high_potential = false,
  } = req.body;
  if (!angle_id || !copy_text || !copy_type) return res.status(400).json({ error: 'angle_id, copy_text, and copy_type required' });

  let rows;
  try {
    ({ rows } = await db.query(
      `INSERT INTO copy_lines (angle_id, copy_text, copy_type, priority_weight, all_vibes, product_ids, high_potential)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [angle_id, copy_text, copy_type, priority_weight, all_vibes, Array.isArray(product_ids) ? product_ids : [], !!high_potential]
    ));
  } catch (err) {
    if (err.code !== '42703') throw err; // high_potential (v25) missing — retry without it.
    console.warn('[copy-lines POST] high_potential column missing — run migrate:v25. Inserting without it.');
    ({ rows } = await db.query(
      `INSERT INTO copy_lines (angle_id, copy_text, copy_type, priority_weight, all_vibes, product_ids)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [angle_id, copy_text, copy_type, priority_weight, all_vibes, Array.isArray(product_ids) ? product_ids : []]
    ));
  }
  await setVibes('copy_line_vibes', 'copy_line_id', rows[0].id, vibe_ids);
  const [withVibes] = await attachVibes(rows, 'copy_line_vibes', 'copy_line_id');
  res.status(201).json(withVibes);
});

router.patch('/:id', requireRole('strategist'), async (req, res) => {
  const { copy_text, copy_type, status, priority_weight, all_vibes, vibe_ids, product_ids, archived, high_potential } = req.body;
  const prodParam = product_ids === undefined ? null : (Array.isArray(product_ids) ? product_ids : []);
  const hpParam = high_potential === undefined ? null : !!high_potential;
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
        high_potential = COALESCE($8, high_potential),
        updated_at = now()
      WHERE id=$9 RETURNING *
    `, [
      copy_text, copy_type, status, priority_weight, all_vibes,
      prodParam, archived, hpParam, req.params.id,
    ]));
  } catch (err) {
    if (err.code !== '42703') throw err;
    // high_potential (v25) missing — retry without it.
    console.warn('[copy-lines PATCH] high_potential column missing — run migrate:v25. Updating without it.');
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
        prodParam, archived, req.params.id,
      ]));
    } catch (err2) {
      if (err2.code === '42703' && archived !== undefined) {
        return res.status(503).json({ error: 'archived column missing — run migrate:v20' });
      }
      throw err2;
    }
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
