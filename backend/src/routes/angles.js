const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { setVibes, attachVibes } = require('../lib/vibes');

const router = express.Router();
router.use(authenticate);

// Strategist board list. ?archived=true returns archived rows only; otherwise
// returns non-archived. Falls back gracefully for pre-v20 databases.
router.get('/', async (req, res) => {
  const wantArchived = req.query.archived === 'true';
  const baseSelect = (withCol) => `
    SELECT a.*,
      COALESCE(json_agg(afc.format_id) FILTER (WHERE afc.format_id IS NOT NULL), '[]') AS compatible_format_ids
    FROM angles a
    LEFT JOIN angle_format_compatibility afc ON afc.angle_id = a.id
    ${withCol ? `WHERE COALESCE(a.archived, FALSE) = ${wantArchived ? 'TRUE' : 'FALSE'}` : ''}
    GROUP BY a.id
    ORDER BY a.priority_weight DESC, a.created_at ASC
  `;
  let rows;
  try {
    ({ rows } = await db.query(baseSelect(true)));
  } catch (err) {
    if (err.code !== '42703') throw err;
    console.warn('[angles GET /] archived column missing — run migrate:v20');
    if (wantArchived) return res.json([]); // pre-v20: nothing is archived
    ({ rows } = await db.query(baseSelect(false)));
  }
  const withVibes = await attachVibes(rows, 'angle_vibes', 'angle_id');
  res.json(withVibes);
});

router.get('/:id', async (req, res) => {
  const { rows } = await db.query(`
    SELECT a.*,
      COALESCE(json_agg(afc.format_id) FILTER (WHERE afc.format_id IS NOT NULL), '[]') AS compatible_format_ids
    FROM angles a
    LEFT JOIN angle_format_compatibility afc ON afc.angle_id = a.id
    WHERE a.id = $1
    GROUP BY a.id
  `, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });

  // Hide archived copy lines from the strategist board (v20). Pre-v20 dbs
  // fall back to the unfiltered query.
  let copyLines;
  try {
    copyLines = await db.query(
      'SELECT * FROM copy_lines WHERE angle_id=$1 AND COALESCE(archived, FALSE) = FALSE ORDER BY created_at ASC',
      [req.params.id]
    );
  } catch (err) {
    if (err.code !== '42703') throw err;
    copyLines = await db.query('SELECT * FROM copy_lines WHERE angle_id=$1 ORDER BY created_at ASC', [req.params.id]);
  }
  const [withVibes] = await attachVibes(rows, 'angle_vibes', 'angle_id');
  res.json({ ...withVibes, copy_lines: copyLines.rows });
});

router.post('/', requireRole('strategist'), async (req, res) => {
  const { name, description, priority_weight = 3, compatible_format_ids = [], all_vibes = false, vibe_ids = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const { rows } = await db.query(
    'INSERT INTO angles (name, description, priority_weight, all_vibes) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, description, priority_weight, all_vibes]
  );
  const angle = rows[0];

  if (compatible_format_ids.length) {
    const values = compatible_format_ids.map((fid, i) => `($1,$${i + 2})`).join(',');
    await db.query(
      `INSERT INTO angle_format_compatibility (angle_id, format_id) VALUES ${values} ON CONFLICT DO NOTHING`,
      [angle.id, ...compatible_format_ids]
    );
  }

  await setVibes('angle_vibes', 'angle_id', angle.id, vibe_ids);

  res.status(201).json({ ...angle, compatible_format_ids, vibe_ids });
});

router.patch('/:id', requireRole('strategist'), async (req, res) => {
  const { name, description, status, priority_weight, compatible_format_ids, all_vibes, vibe_ids, archived } = req.body;
  try {
    await db.query(`
      UPDATE angles SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        priority_weight = COALESCE($4, priority_weight),
        all_vibes = COALESCE($5, all_vibes),
        archived = COALESCE($6, archived),
        updated_at = now()
      WHERE id = $7
    `, [name, description, status, priority_weight, all_vibes, archived, req.params.id]);
  } catch (err) {
    if (err.code === '42703' && archived !== undefined) {
      return res.status(503).json({ error: 'archived column missing — run migrate:v20' });
    }
    throw err;
  }

  if (compatible_format_ids !== undefined) {
    await db.query('DELETE FROM angle_format_compatibility WHERE angle_id=$1', [req.params.id]);
    if (compatible_format_ids.length) {
      const values = compatible_format_ids.map((fid, i) => `($1,$${i + 2})`).join(',');
      await db.query(
        `INSERT INTO angle_format_compatibility (angle_id, format_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [req.params.id, ...compatible_format_ids]
      );
    }
  }

  if (vibe_ids !== undefined) {
    await setVibes('angle_vibes', 'angle_id', req.params.id, vibe_ids);
  }

  const { rows } = await db.query(`
    SELECT a.*,
      COALESCE(json_agg(afc.format_id) FILTER (WHERE afc.format_id IS NOT NULL), '[]') AS compatible_format_ids
    FROM angles a
    LEFT JOIN angle_format_compatibility afc ON afc.angle_id = a.id
    WHERE a.id = $1
    GROUP BY a.id
  `, [req.params.id]);
  const [withVibes] = await attachVibes(rows, 'angle_vibes', 'angle_id');
  res.json(withVibes);
});

// v20: hard delete removed — strategist now archives via PATCH { archived: true }.

module.exports = router;
