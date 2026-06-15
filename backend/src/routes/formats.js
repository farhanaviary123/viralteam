// v7 — formats no longer own a fixed clip pool or clip_structures.
// Clips associate to formats from the clip side (via clip_formats).
// The randomiser fills the shot list at concept-creation time.

const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { setVibes, attachVibes } = require('../lib/vibes');

const router = express.Router();
router.use(authenticate);

async function fetchFormatWithExtras(id) {
  const head = await db.query('SELECT * FROM formats WHERE id=$1', [id]);
  if (!head.rows.length) return null;

  const examples = await db.query(
    `SELECT id, media_url, time_of_day, lighting, location, is_main, created_at
       FROM format_examples WHERE format_id=$1 ORDER BY created_at DESC`,
    [id]
  );
  const mainExample = examples.rows.find(e => e.is_main) || null;

  const compat = await db.query(
    'SELECT angle_id FROM angle_format_compatibility WHERE format_id=$1',
    [id]
  );

  // v15: format_hooks may not exist yet on older databases — degrade gracefully.
  let hookClipIds = [];
  try {
    const hooks = await db.query(
      'SELECT clip_id FROM format_hooks WHERE format_id=$1',
      [id]
    );
    hookClipIds = hooks.rows.map(r => r.clip_id);
  } catch (err) {
    if (err.code === '42P01') {
      console.warn('[formats.fetchFormatWithExtras] format_hooks missing — run migrate:v15');
    } else { throw err; }
  }

  // Clips that appear in any clip_structure for this format (derived in v13).
  const clips = await db.query(`
    SELECT DISTINCT c.id, c.name, c.description, c.reference_url, c.is_hook, c.status, c.weight, c.created_at
      FROM clips c
      JOIN clip_structure_items csi ON csi.clip_id = c.id
      JOIN clip_structures cs ON cs.id = csi.clip_structure_id
     WHERE cs.format_id = $1
     ORDER BY c.created_at DESC
  `, [id]);

  // Clip structures (V1–V5 arrangements) with their items (clip_id, position, takes)
  const structs = await db.query(
    `SELECT * FROM clip_structures WHERE format_id=$1 ORDER BY position ASC, created_at ASC`,
    [id]
  );
  const { loadItems } = require('./clipStructures');
  const itemsByStruct = await loadItems(structs.rows.map(s => s.id));
  const clip_structures = structs.rows.map(s => ({ ...s, items: itemsByStruct.get(s.id) || [] }));

  const [withVibes] = await attachVibes(head.rows, 'format_vibes', 'format_id');
  return {
    ...withVibes,
    compatible_angle_ids: compat.rows.map(r => r.angle_id),
    hook_clip_ids: hookClipIds,
    examples: examples.rows,
    main_example: mainExample,
    clips: clips.rows,
    clip_structures,
  };
}

router.get('/', async (req, res) => {
  const { rows } = await db.query(`
    SELECT f.*,
      COALESCE(
        json_agg(DISTINCT afc.angle_id) FILTER (WHERE afc.angle_id IS NOT NULL),
        '[]'
      ) AS compatible_angle_ids
    FROM formats f
    LEFT JOIN angle_format_compatibility afc ON afc.format_id = f.id
    GROUP BY f.id
    ORDER BY f.priority_weight DESC, f.created_at ASC
  `);
  const withVibes = await attachVibes(rows, 'format_vibes', 'format_id');
  res.json(withVibes);
});

router.get('/:id', async (req, res) => {
  const data = await fetchFormatWithExtras(req.params.id);
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

router.post('/', requireRole('strategist'), async (req, res) => {
  const {
    name, description, reference_media_url, thumbnail_url,
    required_copy_type, format_type,
    priority_weight = 3,
    compatible_angle_ids = [],
    hook_clip_ids = [],
    all_vibes = false, vibe_ids = [],
  } = req.body;
  if (!name || !Array.isArray(required_copy_type) || required_copy_type.length === 0) {
    return res.status(400).json({ error: 'Name and at least one required_copy_type are required' });
  }

  const { rows } = await db.query(`
    INSERT INTO formats
      (name, description, reference_media_url, thumbnail_url,
       required_copy_type, format_type, priority_weight, all_vibes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
  `, [
    name, description, reference_media_url, thumbnail_url,
    required_copy_type, format_type, priority_weight, all_vibes,
  ]);
  const format = rows[0];

  for (const aid of compatible_angle_ids) {
    await db.query(
      'INSERT INTO angle_format_compatibility (angle_id, format_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [aid, format.id]
    );
  }

  try {
    for (const cid of hook_clip_ids) {
      await db.query(
        'INSERT INTO format_hooks (format_id, clip_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [format.id, cid]
      );
    }
  } catch (err) {
    if (err.code === '42P01') {
      console.warn('[formats POST] format_hooks missing — skipping hook sync; run migrate:v15');
    } else { throw err; }
  }

  await setVibes('format_vibes', 'format_id', format.id, vibe_ids);

  const full = await fetchFormatWithExtras(format.id);
  res.status(201).json(full);
});

// PATCH does NOT touch format_examples — those have their own dedicated routes
// in formatExamples.js. The response (fetchFormatWithExtras) re-includes the
// full examples list so the modal/parent never has to refetch on its own.
router.patch('/:id', requireRole('strategist'), async (req, res) => {
  const {
    name, description, reference_media_url, thumbnail_url,
    required_copy_type, format_type,
    status, priority_weight,
    compatible_angle_ids,
    hook_clip_ids,
    all_vibes, vibe_ids,
  } = req.body;

  await db.query(`
    UPDATE formats SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      reference_media_url = COALESCE($3, reference_media_url),
      thumbnail_url = COALESCE($4, thumbnail_url),
      required_copy_type = COALESCE($5, required_copy_type),
      format_type = COALESCE($6, format_type),
      status = COALESCE($7, status),
      priority_weight = COALESCE($8, priority_weight),
      all_vibes = COALESCE($9, all_vibes),
      updated_at = now()
    WHERE id=$10
  `, [
    name, description, reference_media_url, thumbnail_url,
    required_copy_type, format_type, status, priority_weight, all_vibes,
    req.params.id,
  ]);

  if (compatible_angle_ids !== undefined) {
    await db.query('DELETE FROM angle_format_compatibility WHERE format_id=$1', [req.params.id]);
    for (const aid of compatible_angle_ids) {
      await db.query(
        'INSERT INTO angle_format_compatibility (angle_id, format_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [aid, req.params.id]
      );
    }
  }

  if (hook_clip_ids !== undefined) {
    try {
      await db.query('DELETE FROM format_hooks WHERE format_id=$1', [req.params.id]);
      for (const cid of hook_clip_ids) {
        await db.query(
          'INSERT INTO format_hooks (format_id, clip_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [req.params.id, cid]
        );
      }
    } catch (err) {
      if (err.code === '42P01') {
        console.warn('[formats PATCH] format_hooks missing — skipping hook sync; run migrate:v15');
      } else { throw err; }
    }
  }

  if (vibe_ids !== undefined) {
    await setVibes('format_vibes', 'format_id', req.params.id, vibe_ids);
  }

  const full = await fetchFormatWithExtras(req.params.id);
  if (!full) return res.status(404).json({ error: 'Not found' });
  res.json(full);
});

// Delete: hard-delete if possible, otherwise soft-delete (status='retired')
// when concepts still reference the format (FK is ON DELETE RESTRICT).
router.delete('/:id', requireRole('strategist'), async (req, res) => {
  try {
    const r = await db.query('DELETE FROM formats WHERE id=$1 RETURNING id', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json({ deleted: r.rows[0].id });
  } catch (err) {
    if (err.code === '23503') {
      // Fall back to soft-delete
      const upd = await db.query(
        `UPDATE formats SET status='retired', updated_at=now() WHERE id=$1 RETURNING id, status`,
        [req.params.id]
      );
      if (!upd.rows.length) return res.status(404).json({ error: 'Not found' });
      return res.json({ retired: upd.rows[0].id, status: 'retired' });
    }
    throw err;
  }
});

module.exports = router;
