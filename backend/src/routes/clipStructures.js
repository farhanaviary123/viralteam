// v8 — clip structures (a.k.a. arrangements). Each format has up to 5
// arrangements (V1–V5). An arrangement is an ordered list of clip items, each
// with a `takes` count telling the creator how many times to shoot that clip.
//
// GET    /api/formats/:formatId/clip-structures      -> list (with items)
// POST   /api/formats/:formatId/clip-structures      -> create (name, position, items[])
// PATCH  /api/clip-structures/:id                    -> update (any field; items replaces)
// DELETE /api/clip-structures/:id                    -> hard delete (cascades items + concept link)

const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

async function loadItems(structureIds) {
  if (!structureIds.length) return new Map();
  const { rows } = await db.query(`
    SELECT csi.id, csi.clip_structure_id, csi.clip_id, csi.position, csi.takes,
           c.name AS clip_name, c.reference_url, c.description AS clip_description
      FROM clip_structure_items csi
      JOIN clips c ON c.id = csi.clip_id
     WHERE csi.clip_structure_id = ANY($1::uuid[])
     ORDER BY csi.clip_structure_id, csi.position
  `, [structureIds]);
  const byStruct = new Map();
  for (const r of rows) {
    if (!byStruct.has(r.clip_structure_id)) byStruct.set(r.clip_structure_id, []);
    byStruct.get(r.clip_structure_id).push({
      id: r.id,
      clip_id: r.clip_id,
      position: r.position,
      takes: r.takes,
      name: r.clip_name,
      reference_url: r.reference_url,
      description: r.clip_description,
    });
  }
  return byStruct;
}

async function attachItems(structures) {
  const ids = structures.map(s => s.id);
  const byStruct = await loadItems(ids);
  return structures.map(s => ({ ...s, items: byStruct.get(s.id) || [] }));
}

async function syncItems(structureId, items) {
  await db.query('DELETE FROM clip_structure_items WHERE clip_structure_id=$1', [structureId]);
  let pos = 1;
  for (const it of items) {
    if (!it || !it.clip_id) continue;
    const takes = Number.isInteger(Number(it.takes)) && Number(it.takes) > 0 ? Number(it.takes) : 1;
    await db.query(
      `INSERT INTO clip_structure_items (clip_structure_id, clip_id, position, takes)
       VALUES ($1,$2,$3,$4)`,
      [structureId, it.clip_id, pos++, takes]
    );
  }
}

// LIST by format
router.get('/formats/:formatId/clip-structures', async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM clip_structures WHERE format_id=$1 ORDER BY position ASC, created_at ASC`,
    [req.params.formatId]
  );
  res.json(await attachItems(rows));
});

// CREATE
router.post('/formats/:formatId/clip-structures', requireRole('strategist'), async (req, res) => {
  const { name, position, status = 'active', items = [] } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!Number.isInteger(Number(position)) || position < 1 || position > 5) {
    return res.status(400).json({ error: 'position must be 1–5' });
  }
  if (!['active','paused','retired'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  try {
    const ins = await db.query(
      `INSERT INTO clip_structures (format_id, name, position, status)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.formatId, name.trim(), Number(position), status]
    );
    const struct = ins.rows[0];
    if (Array.isArray(items)) await syncItems(struct.id, items);
    const [withItems] = await attachItems([struct]);
    res.status(201).json(withItems);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A structure already exists at this position for this format' });
    throw err;
  }
});

// UPDATE
router.patch('/clip-structures/:id', requireRole('strategist'), async (req, res) => {
  const { name, position, status, items } = req.body;
  if (status !== undefined && !['active','paused','retired'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  if (position !== undefined && (!Number.isInteger(Number(position)) || position < 1 || position > 5)) {
    return res.status(400).json({ error: 'position must be 1–5' });
  }

  try {
    const upd = await db.query(`
      UPDATE clip_structures SET
        name     = COALESCE($1, name),
        position = COALESCE($2, position),
        status   = COALESCE($3, status)
      WHERE id=$4 RETURNING *
    `, [name?.trim() || null, position === undefined ? null : Number(position), status || null, req.params.id]);
    if (!upd.rows.length) return res.status(404).json({ error: 'Not found' });
    if (Array.isArray(items)) await syncItems(req.params.id, items);
    const [withItems] = await attachItems(upd.rows);
    res.json(withItems);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A structure already exists at this position for this format' });
    throw err;
  }
});

// DELETE
router.delete('/clip-structures/:id', requireRole('strategist'), async (req, res) => {
  // Force-delete: clear concept_variations rows that pin this arrangement to
  // existing concepts before dropping the structure itself. Once v18 has run
  // the FK has ON DELETE CASCADE and the manual delete is a no-op.
  // concept_clip_structures (legacy 1:1) is also wiped in case any old rows
  // still reference this id.
  try {
    await db.query('DELETE FROM concept_variations WHERE clip_structure_id=$1', [req.params.id]);
  } catch (err) {
    if (err.code !== '42P01') throw err; // table not yet created on legacy DBs
  }
  await db.query('DELETE FROM concept_clip_structures WHERE clip_structure_id=$1', [req.params.id]);
  const r = await db.query('DELETE FROM clip_structures WHERE id=$1 RETURNING id', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: r.rows[0].id });
});

module.exports = { router, loadItems };
