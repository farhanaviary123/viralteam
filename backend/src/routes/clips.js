// v13 — unified clip library. Clips no longer carry a direct format link.
// `format_ids` / `format_names` on the response are DERIVED from
// clip_structure_items: a clip belongs to a format iff it appears in any
// clip_structure of that format. Hooks (is_hook=true) are universal.
//
// GET    /api/clips              -> all clips, with derived format associations
// GET    /api/clips?format_id=…  -> clips that appear in any structure for that format
// GET    /api/clips/:id          -> single clip with derived associations
// POST   /api/clips              -> create (no format selection)
// PUT    /api/clips/:id          -> update
// PATCH  /api/clips/:id          -> alias of PUT
// DELETE /api/clips/:id          -> hard delete (cascades concept_shot_list & structure items)

const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── Helpers ─────────────────────────────────────────────────────────

async function attachFormats(clips) {
  if (!clips.length) return clips;
  const ids = clips.map(c => c.id);
  const { rows } = await db.query(`
    SELECT DISTINCT csi.clip_id, cs.format_id, f.name AS format_name
      FROM clip_structure_items csi
      JOIN clip_structures cs ON cs.id = csi.clip_structure_id
      JOIN formats f ON f.id = cs.format_id
     WHERE csi.clip_id = ANY($1::uuid[])
  `, [ids]);
  const byClip = new Map();
  for (const r of rows) {
    if (!byClip.has(r.clip_id)) byClip.set(r.clip_id, { ids: [], names: [] });
    byClip.get(r.clip_id).ids.push(r.format_id);
    byClip.get(r.clip_id).names.push(r.format_name);
  }
  return clips.map(c => ({
    ...c,
    format_ids: byClip.get(c.id)?.ids || [],
    format_names: byClip.get(c.id)?.names || [],
  }));
}

function validateBody(body, { isCreate }) {
  const errs = [];
  if (isCreate && !body.name) errs.push('name is required');
  if (body.status !== undefined && !['active','paused','retired'].includes(body.status))
    errs.push("status must be one of active, paused, retired");
  if (body.weight !== undefined) {
    const w = Number(body.weight);
    if (!Number.isInteger(w) || w < 1 || w > 5) errs.push('weight must be an integer 1–5');
  }
  return errs;
}

// ── Routes ──────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { format_id } = req.query;
  let rows;
  if (format_id) {
    // Clips that appear in any clip_structure of this format (derived membership).
    const r = await db.query(`
      SELECT DISTINCT c.*
        FROM clips c
        JOIN clip_structure_items csi ON csi.clip_id = c.id
        JOIN clip_structures cs ON cs.id = csi.clip_structure_id
       WHERE cs.format_id = $1
       ORDER BY c.created_at DESC
    `, [format_id]);
    rows = r.rows;
  } else {
    const r = await db.query('SELECT * FROM clips ORDER BY created_at DESC');
    rows = r.rows;
  }
  res.json(await attachFormats(rows));
});

router.get('/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM clips WHERE id=$1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const [withFormats] = await attachFormats(rows);
  res.json(withFormats);
});

router.post('/', requireRole('strategist'), async (req, res) => {
  const errs = validateBody(req.body, { isCreate: true });
  if (errs.length) return res.status(400).json({ error: errs.join('; ') });

  const {
    name, description = null, reference_url = null,
    is_hook = false, body_eligible = true,
    status = 'active', weight = 3,
    product_ids = [],
  } = req.body;
  if (!is_hook && !body_eligible) {
    return res.status(400).json({ error: 'Clip must be at least one of hook / body' });
  }

  const ins = await db.query(`
    INSERT INTO clips (name, description, reference_url, is_hook, body_eligible, status, weight, product_ids)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
  `, [
    name, description, reference_url, !!is_hook, !!body_eligible,
    status, Number(weight), Array.isArray(product_ids) ? product_ids : [],
  ]);
  const clip = ins.rows[0];

  const [withFormats] = await attachFormats([clip]);
  res.status(201).json(withFormats);
});

async function updateClip(req, res) {
  const errs = validateBody(req.body, { isCreate: false });
  if (errs.length) return res.status(400).json({ error: errs.join('; ') });

  const {
    name, description, reference_url,
    is_hook, body_eligible,
    status, weight,
    product_ids,
  } = req.body;
  if (is_hook === false && body_eligible === false) {
    return res.status(400).json({ error: 'Clip must be at least one of hook / body' });
  }

  const upd = await db.query(`
    UPDATE clips SET
      name           = COALESCE($1, name),
      description    = COALESCE($2, description),
      reference_url  = COALESCE($3, reference_url),
      is_hook        = COALESCE($4, is_hook),
      body_eligible  = COALESCE($5, body_eligible),
      status         = COALESCE($6, status),
      weight         = COALESCE($7, weight),
      product_ids    = COALESCE($8, product_ids)
    WHERE id=$9 RETURNING *
  `, [
    name, description, reference_url,
    is_hook === undefined ? null : !!is_hook,
    body_eligible === undefined ? null : !!body_eligible,
    status, weight === undefined ? null : Number(weight),
    product_ids === undefined ? null : (Array.isArray(product_ids) ? product_ids : []),
    req.params.id,
  ]);
  if (!upd.rows.length) return res.status(404).json({ error: 'Not found' });

  const [withFormats] = await attachFormats(upd.rows);
  res.json(withFormats);
}

router.put('/:id', requireRole('strategist'), updateClip);
router.patch('/:id', requireRole('strategist'), updateClip);

// Usage report — how many arrangements + which formats reference this clip.
// Frontend uses this to warn the strategist before they confirm deletion.
router.get('/:id/usage', async (req, res) => {
  const r = await db.query(`
    SELECT DISTINCT cs.id AS structure_id, cs.name AS structure_name,
           f.id AS format_id, f.name AS format_name
      FROM clip_structure_items csi
      JOIN clip_structures cs ON cs.id = csi.clip_structure_id
      JOIN formats f ON f.id = cs.format_id
     WHERE csi.clip_id = $1
  `, [req.params.id]);
  res.json({
    arrangement_count: r.rows.length,
    formats: [...new Map(r.rows.map(x => [x.format_id, { id: x.format_id, name: x.format_name }])).values()],
    arrangements: r.rows.map(x => ({ id: x.structure_id, name: x.structure_name, format_id: x.format_id })),
  });
});

router.delete('/:id', requireRole('strategist'), async (req, res) => {
  // Force-delete: if the FK on clip_structure_items hasn't been migrated to
  // ON DELETE CASCADE yet (v17), clear the references manually first.
  try {
    const r = await db.query('DELETE FROM clips WHERE id=$1 RETURNING id', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json({ deleted: r.rows[0].id });
  } catch (err) {
    if (err.code !== '23503') throw err;
    console.warn('[clips DELETE] FK violation — clearing arrangement refs manually. Run migrate:v17.');
    await db.query('DELETE FROM clip_structure_items WHERE clip_id=$1', [req.params.id]);
    const r2 = await db.query('DELETE FROM clips WHERE id=$1 RETURNING id', [req.params.id]);
    if (!r2.rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json({ deleted: r2.rows[0].id });
  }
});

module.exports = router;
