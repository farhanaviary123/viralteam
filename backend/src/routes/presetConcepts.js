// v7 — preset concepts no longer carry per-variation clip_structures
// (the randomiser fills the shot list at concept-creation time).
// Presets still carry: angle, V1–V5 copy_lines, V1–V5 songs, vibes.

const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { setVibes, attachVibes } = require('../lib/vibes');

const router = express.Router();
router.use(authenticate);

async function fetchPreset(id) {
  const head = await db.query(`
    SELECT p.*, f.name AS format_name, a.name AS angle_name
    FROM preset_concepts p
    JOIN formats f ON f.id = p.format_id
    JOIN angles  a ON a.id = p.angle_id
    WHERE p.id = $1
  `, [id]);
  if (!head.rows.length) return null;

  const copy = await db.query(`
    SELECT pccl.position, cl.id, cl.copy_text, cl.copy_type
    FROM preset_concept_copy_lines pccl
    JOIN copy_lines cl ON cl.id = pccl.copy_line_id
    WHERE pccl.preset_concept_id = $1
    ORDER BY pccl.position
  `, [id]);

  const songs = await db.query(`
    SELECT pcs.position, s.id, s.name, s.link
    FROM preset_concept_songs pcs
    JOIN songs s ON s.id = pcs.song_id
    WHERE pcs.preset_concept_id = $1
    ORDER BY pcs.position
  `, [id]);

  const [withVibes] = await attachVibes(head.rows, 'preset_concept_vibes', 'preset_concept_id');

  return {
    ...withVibes,
    copy_lines: copy.rows,
    songs: songs.rows,
    copy_line_ids: copy.rows.map(r => r.id),
    song_ids: songs.rows.map(r => r.id),
  };
}

function validateFive(label, arr) {
  if (!Array.isArray(arr) || arr.length !== 5) {
    throw new Error(`${label} must contain exactly 5 entries (got ${Array.isArray(arr) ? arr.length : 0})`);
  }
}

async function syncOrdered(table, parentCol, childCol, parentId, ids) {
  await db.query(`DELETE FROM ${table} WHERE ${parentCol}=$1`, [parentId]);
  for (let i = 0; i < ids.length; i++) {
    await db.query(
      `INSERT INTO ${table} (${parentCol}, ${childCol}, position) VALUES ($1,$2,$3)`,
      [parentId, ids[i], i + 1]
    );
  }
}

router.get('/', async (req, res) => {
  const { rows } = await db.query(`
    SELECT p.*, f.name AS format_name, a.name AS angle_name
    FROM preset_concepts p
    JOIN formats f ON f.id = p.format_id
    JOIN angles  a ON a.id = p.angle_id
    ORDER BY p.priority_weight DESC, p.created_at ASC
  `);
  const withVibes = await attachVibes(rows, 'preset_concept_vibes', 'preset_concept_id');
  res.json(withVibes);
});

router.get('/:id', async (req, res) => {
  const data = await fetchPreset(req.params.id);
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

router.post('/', requireRole('strategist'), async (req, res) => {
  const {
    name, format_id, angle_id,
    copy_line_ids = [], song_ids = [],
    vibe_ids = [], all_vibes = false,
    priority_weight = 3, status = 'active',
  } = req.body;

  if (!name || !format_id || !angle_id) {
    return res.status(400).json({ error: 'name, format_id and angle_id are required' });
  }
  try {
    validateFive('Copy lines', copy_line_ids);
    validateFive('Songs', song_ids);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const ins = await db.query(`
    INSERT INTO preset_concepts (name, format_id, angle_id, priority_weight, status, all_vibes)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
  `, [name, format_id, angle_id, priority_weight, status, all_vibes]);
  const preset = ins.rows[0];

  await syncOrdered('preset_concept_copy_lines', 'preset_concept_id', 'copy_line_id', preset.id, copy_line_ids);
  await syncOrdered('preset_concept_songs', 'preset_concept_id', 'song_id', preset.id, song_ids);
  await setVibes('preset_concept_vibes', 'preset_concept_id', preset.id, vibe_ids);

  const full = await fetchPreset(preset.id);
  res.status(201).json(full);
});

router.patch('/:id', requireRole('strategist'), async (req, res) => {
  const {
    name, format_id, angle_id,
    copy_line_ids, song_ids,
    vibe_ids, all_vibes,
    priority_weight, status,
  } = req.body;

  try {
    if (copy_line_ids !== undefined) validateFive('Copy lines', copy_line_ids);
    if (song_ids !== undefined)      validateFive('Songs', song_ids);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const exists = await db.query('SELECT id FROM preset_concepts WHERE id=$1', [req.params.id]);
  if (!exists.rows.length) return res.status(404).json({ error: 'Not found' });

  await db.query(`
    UPDATE preset_concepts SET
      name            = COALESCE($1, name),
      format_id       = COALESCE($2, format_id),
      angle_id        = COALESCE($3, angle_id),
      priority_weight = COALESCE($4, priority_weight),
      status          = COALESCE($5, status),
      all_vibes       = COALESCE($6, all_vibes),
      updated_at      = now()
    WHERE id=$7
  `, [name, format_id, angle_id, priority_weight, status, all_vibes, req.params.id]);

  if (copy_line_ids !== undefined)
    await syncOrdered('preset_concept_copy_lines', 'preset_concept_id', 'copy_line_id', req.params.id, copy_line_ids);
  if (song_ids !== undefined)
    await syncOrdered('preset_concept_songs', 'preset_concept_id', 'song_id', req.params.id, song_ids);
  if (vibe_ids !== undefined)
    await setVibes('preset_concept_vibes', 'preset_concept_id', req.params.id, vibe_ids);

  const full = await fetchPreset(req.params.id);
  res.json(full);
});

module.exports = router;
