const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { generateConcept } = require('../lib/generation');

const router = express.Router();
router.use(authenticate);

const STATUS_ORDER = ['needs_shooting', 'ready_to_edit', 'done'];

// Build full concept including format shot list, all per-variation assignments
async function fetchConcept(id) {
  const head = await db.query(`
    SELECT
      cp.*,
      a.name AS angle_name,
      a.description AS angle_description,
      f.name AS format_name,
      f.description AS format_description,
      f.format_type,
      -- Shoot-phase reference: prefer the format's marked main example,
      -- then the most recent example (so creators see something as soon as
      -- the strategist uploads any reference), then the legacy field.
      COALESCE(
        (SELECT media_url FROM format_examples
          WHERE format_id = f.id AND is_main = true LIMIT 1),
        (SELECT media_url FROM format_examples
          WHERE format_id = f.id ORDER BY created_at DESC LIMIT 1),
        f.reference_media_url
      ) AS format_reference_media_url,
      f.thumbnail_url AS format_thumbnail_url,
      f.required_copy_type
    FROM concept_projects cp
    LEFT JOIN angles a ON a.id = cp.angle_id
    LEFT JOIN formats f ON f.id = cp.format_id
    WHERE cp.id = $1
  `, [id]);
  if (!head.rows.length) return null;
  const concept = head.rows[0];

  // Per-creator sequential number (1 = oldest, N = newest) for "Concept N:" labels.
  const seq = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM concept_projects
      WHERE creator_id = $1
        AND created_at <= $2`,
    [concept.creator_id, concept.created_at]
  );
  concept.sequential_number = seq.rows[0]?.n || 1;

  // v8 shot list — derived from the picked clip_structure + the assigned hook.
  // Hook is always rendered as ×5 takes by the creator UI.
  const hookRes = concept.hook_clip_id ? await db.query(
    `SELECT id, name, reference_url, description, is_hook, body_eligible
       FROM clips WHERE id=$1`,
    [concept.hook_clip_id]
  ) : { rows: [] };
  const hook = hookRes.rows[0] || null;

  // v16: load all per-variation arrangements (ordered by position 1..N).
  // Falls back to legacy 1:1 concept_clip_structures row if v16 not yet run.
  let arrangements = [];
  try {
    const cvs = await db.query(
      `SELECT cv.position, cv.clip_structure_id, cs.name
         FROM concept_variations cv
         JOIN clip_structures cs ON cs.id = cv.clip_structure_id
        WHERE cv.concept_id=$1
        ORDER BY cv.position ASC`,
      [id]
    );
    arrangements = cvs.rows;
  } catch (err) {
    if (err.code !== '42P01') throw err;
    console.warn('[concepts.fetchConcept] concept_variations missing — run migrate:v16');
  }
  if (!arrangements.length) {
    const ccs = await db.query(
      `SELECT clip_structure_id, cs.name
         FROM concept_clip_structures ccs
         JOIN clip_structures cs ON cs.id = ccs.clip_structure_id
        WHERE ccs.concept_id=$1`,
      [id]
    );
    arrangements = ccs.rows.map((r, i) => ({ ...r, position: i + 1 }));
  }

  // Load items for each unique arrangement once.
  //
  // No product filter here — the saved arrangement is the source of truth for
  // what the creator should shoot. Product filtering only belongs in
  // generation.js when picking which arrangements to assign to a concept.
  const uniqStructIds = [...new Set(arrangements.map(a => a.clip_structure_id))];
  const itemsByStruct = new Map();
  for (const sid of uniqStructIds) {
    const items = await db.query(`
      SELECT csi.id, csi.clip_id, csi.position, csi.takes,
             c.name, c.reference_url, c.description, c.product_ids,
             c.is_hook, c.body_eligible
        FROM clip_structure_items csi
        JOIN clips c ON c.id = csi.clip_id
       WHERE csi.clip_structure_id = $1
       ORDER BY csi.position ASC
    `, [sid]);
    itemsByStruct.set(sid, items.rows);
  }
  const arrangementsFull = arrangements.map(a => ({
    ...a,
    items: itemsByStruct.get(a.clip_structure_id) || [],
  }));

  // Compute body clip takes.
  //   For each clip that appears in position 1 OR position 2 of any variation,
  //   takes = total number of times it appears in position 1 + position 2
  //   combined across all variations. Clips that only appear in position 3+
  //   default to takes = 1.
  const clipTakes = new Map();
  for (const a of arrangementsFull) {
    const pos1 = a.items[0]?.clip_id;
    const pos2 = a.items[1]?.clip_id;
    if (pos1) clipTakes.set(pos1, (clipTakes.get(pos1) || 0) + 1);
    if (pos2) clipTakes.set(pos2, (clipTakes.get(pos2) || 0) + 1);
  }

  // Merge body clips: unique by clip_id across all arrangements, preserving
  // earliest (arrangement position, item position) ordering.
  const seenClip = new Map();
  arrangementsFull.forEach((a, ai) => {
    a.items.forEach((item, ii) => {
      if (!seenClip.has(item.clip_id)) {
        seenClip.set(item.clip_id, {
          clip_id: item.clip_id,
          name: item.name,
          reference_url: item.reference_url,
          description: item.description,
          is_hook: item.is_hook,
          body_eligible: item.body_eligible,
          takes: clipTakes.get(item.clip_id) || 1,
          _sortKey: ai * 1000 + ii,
        });
      }
    });
  });
  const body_clips = [...seenClip.values()]
    .sort((a, b) => a._sortKey - b._sortKey)
    .map(({ _sortKey, ...rest }) => rest);

  // Back-compat: keep `clip_structure` pointing at the first arrangement.
  const clip_structure = arrangementsFull[0]
    ? { id: arrangementsFull[0].clip_structure_id, name: arrangementsFull[0].name, items: arrangementsFull[0].items }
    : null;

  // Variations 1-5 — copy + song only
  const copy = await db.query(`
    SELECT ccl.variation_number, cl.id, cl.copy_text, cl.copy_type
    FROM concept_copy_lines ccl JOIN copy_lines cl ON cl.id = ccl.copy_line_id
    WHERE ccl.concept_id = $1 ORDER BY ccl.variation_number ASC
  `, [id]);

  // Pull songs incl. tiktok_link if the column exists (v19+). Fallback for
  // pre-v19 databases keeps the rest of the fetch working.
  let songs;
  try {
    songs = await db.query(`
      SELECT cs.variation_number, s.id, s.name, s.link, s.tiktok_link
      FROM concept_songs cs JOIN songs s ON s.id = cs.song_id
      WHERE cs.concept_id = $1 ORDER BY cs.variation_number ASC
    `, [id]);
  } catch (err) {
    if (err.code !== '42703') throw err;
    console.warn('[concepts.fetchConcept] songs.tiktok_link missing — run migrate:v19');
    songs = await db.query(`
      SELECT cs.variation_number, s.id, s.name, s.link
      FROM concept_songs cs JOIN songs s ON s.id = cs.song_id
      WHERE cs.concept_id = $1 ORDER BY cs.variation_number ASC
    `, [id]);
  }

  const vCount = concept.variation_count || arrangementsFull.length || 5;
  const variations = [];
  for (let v = 1; v <= vCount; v++) {
    const cv = copy.rows.find(r => r.variation_number === v);
    const sv = songs.rows.find(r => r.variation_number === v);
    const arr = arrangementsFull.find(a => a.position === v);
    if (!cv && !sv && !arr) continue;
    variations.push({
      variation_number: v,
      copy_line: cv ? { id: cv.id, copy_text: cv.copy_text, copy_type: cv.copy_type } : null,
      song: sv ? { id: sv.id, name: sv.name, link: sv.link, tiktok_link: sv.tiktok_link || null } : null,
      arrangement: arr ? { clip_structure_id: arr.clip_structure_id, name: arr.name, items: arr.items } : null,
    });
  }

  return {
    ...concept,
    hook,
    clip_structure,
    arrangements: arrangementsFull,
    body_clips,
    variations,
  };
}

// LIST
//
// Each row carries a per-creator `sequential_number` (1 = oldest, N = newest)
// derived from row_number() over creation date. Used by the UI to render
// "Concept N: <angle>" labels.
router.get('/', async (req, res) => {
  let query, params;
  if (req.user.role === 'strategist') {
    query = `
      SELECT cp.*, a.name AS angle_name, f.name AS format_name, u.name AS creator_name,
        ROW_NUMBER() OVER (PARTITION BY cp.creator_id ORDER BY cp.created_at ASC) AS sequential_number
      FROM concept_projects cp
      LEFT JOIN angles a ON a.id = cp.angle_id
      LEFT JOIN formats f ON f.id = cp.format_id
      JOIN users u ON u.id = cp.creator_id
      ORDER BY cp.created_at DESC`;
    params = [];
  } else {
    query = `
      SELECT cp.*, a.name AS angle_name, f.name AS format_name,
        ROW_NUMBER() OVER (PARTITION BY cp.creator_id ORDER BY cp.created_at ASC) AS sequential_number
      FROM concept_projects cp
      LEFT JOIN angles a ON a.id = cp.angle_id
      LEFT JOIN formats f ON f.id = cp.format_id
      WHERE cp.creator_id = $1
      ORDER BY cp.created_at DESC`;
    params = [req.user.id];
  }
  const { rows } = await db.query(query, params);
  res.json(rows);
});

// GET ONE
router.get('/:id', async (req, res) => {
  // Minimal Guide concepts (no format) don't go through the format-dependent
  // fetchConcept query — return the row + a per-creator sequential number.
  const base = await db.query('SELECT * FROM concept_projects WHERE id = $1', [req.params.id]);
  if (!base.rows.length) return res.status(404).json({ error: 'Not found' });
  const row = base.rows[0];
  if (req.user.role === 'creator' && row.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!row.format_id) {
    const seq = await db.query(
      'SELECT COUNT(*)::int AS n FROM concept_projects WHERE creator_id = $1 AND created_at <= $2',
      [row.creator_id, row.created_at]
    );
    return res.json({ ...row, sequential_number: seq.rows[0]?.n || 1, variations: [] });
  }

  const concept = await fetchConcept(req.params.id);
  if (!concept) return res.status(404).json({ error: 'Not found' });
  res.json(concept);
});

// CREATE
//
// Two shapes:
//   1. Guide wizard (v21): body { creative_path } → minimal concept with no
//      angle/format. Status starts at 'pending_upload'. This is the live
//      creator flow.
//   2. Legacy rich builder: body { format_id, ... } → engine assigns
//      angle/clips/copy/songs. Kept for back-compat.
router.post('/', requireRole('creator'), async (req, res) => {
  const { format_id, product_id = null, variation_count, creative_path } = req.body;

  // --- Guide wizard: minimal concept ---------------------------------------
  if (!format_id) {
    if (creative_path && !['from_video', 'from_text'].includes(creative_path)) {
      return res.status(400).json({ error: 'invalid creative_path' });
    }
    // Per-creator sequential number for the title, computed before insert.
    const seq = await db.query(
      'SELECT COUNT(*)::int AS n FROM concept_projects WHERE creator_id = $1',
      [req.user.id]
    );
    const nextNum = (seq.rows[0]?.n || 0) + 1;
    const title = `Concept ${nextNum}`;
    const concept = (await db.query(
      `INSERT INTO concept_projects (title, creator_id, status, creative_path)
       VALUES ($1, $2, 'pending_upload', $3) RETURNING *`,
      [title, req.user.id, creative_path || null]
    )).rows[0];
    // Minimal concepts have no angle/format/clips/songs — the wizard only needs
    // the id + status back, so return the inserted row directly (avoids the
    // format-dependent fetchConcept query).
    return res.status(201).json({ ...concept, sequential_number: nextNum });
  }

  const vCount = Math.max(1, Math.min(5, Number(variation_count) || 5));

  console.log('[concepts POST] body=', req.body);
  console.log('[concepts POST] format_id=', format_id, 'product_id=', product_id, 'variation_count=', vCount);

  let assignment;
  try {
    assignment = await generateConcept(format_id, product_id || null, vCount);
  } catch (err) {
    console.error('[concepts POST] generateConcept threw:', err.message);
    return res.status(400).json({ error: err.message });
  }
  console.log('[concepts POST] assignment=', {
    angle_id: assignment.angle_id,
    hook_clip_id: assignment.hook_clip_id,
    clip_structure_ids: assignment.clip_structure_ids,
    preset_concept_id: assignment.preset_concept_id,
    copy_line_ids: assignment.copy_line_ids,
  });

  // Build title
  const titleQ = await db.query(`
    SELECT a.name AS angle_name, f.name AS format_name
    FROM angles a, formats f
    WHERE a.id = $1 AND f.id = $2
  `, [assignment.angle_id, format_id]);
  const { angle_name, format_name } = titleQ.rows[0];
  const title = `${angle_name} — ${format_name}`;

  // Insert concept. variation_count column added in v16 — fall back gracefully
  // if migration hasn't been run yet.
  let concept;
  try {
    concept = (await db.query(
      `INSERT INTO concept_projects
         (title, creator_id, angle_id, format_id, preset_concept_id, hook_clip_id, product_id, variation_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        title, req.user.id, assignment.angle_id, format_id,
        assignment.preset_concept_id || null,
        assignment.hook_clip_id || null,
        product_id || null,
        vCount,
      ]
    )).rows[0];
  } catch (err) {
    if (err.code === '42703') {
      console.warn('[concepts POST] variation_count column missing — run migrate:v16. Inserting without it.');
      concept = (await db.query(
        `INSERT INTO concept_projects
           (title, creator_id, angle_id, format_id, preset_concept_id, hook_clip_id, product_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          title, req.user.id, assignment.angle_id, format_id,
          assignment.preset_concept_id || null,
          assignment.hook_clip_id || null,
          product_id || null,
        ]
      )).rows[0];
    } else { throw err; }
  }
  console.log('[concepts POST] inserted concept id=', concept.id, 'product_id=', concept.product_id);

  // Insert per-variation copy + song assignments (length = vCount)
  for (let i = 0; i < vCount; i++) {
    const v = i + 1;
    if (assignment.copy_line_ids[i]) {
      await db.query(
        'INSERT INTO concept_copy_lines (concept_id, copy_line_id, variation_number) VALUES ($1,$2,$3)',
        [concept.id, assignment.copy_line_ids[i], v]
      );
    }
    if (assignment.song_ids[i]) {
      await db.query(
        'INSERT INTO concept_songs (concept_id, song_id, variation_number) VALUES ($1,$2,$3)',
        [concept.id, assignment.song_ids[i], v]
      );
    }
  }

  // Persist picked arrangements: one row per variation in concept_variations.
  // Falls back to legacy concept_clip_structures (first pick only) if v16
  // hasn't been run yet.
  const picks = assignment.clip_structure_ids || [];
  let usedFallback = false;
  for (let i = 0; i < picks.length; i++) {
    const sid = picks[i];
    if (!sid) continue;
    try {
      await db.query(
        `INSERT INTO concept_variations (concept_id, clip_structure_id, position) VALUES ($1,$2,$3)`,
        [concept.id, sid, i + 1]
      );
    } catch (err) {
      if (err.code === '42P01') {
        usedFallback = true;
        if (i === 0) {
          await db.query(
            `INSERT INTO concept_clip_structures (concept_id, clip_structure_id) VALUES ($1,$2)`,
            [concept.id, sid]
          );
        }
      } else { throw err; }
    }
  }
  if (usedFallback) {
    console.warn('[concepts POST] concept_variations missing — stored first pick only via legacy table. Run migrate:v16.');
  }

  const full = await fetchConcept(concept.id);
  res.status(201).json(full);
});

// PATCH footage link
router.patch('/:id/footage-link', requireRole('creator'), async (req, res) => {
  const { footage_link } = req.body;
  const owner = await db.query('SELECT creator_id FROM concept_projects WHERE id=$1', [req.params.id]);
  if (!owner.rows.length) return res.status(404).json({ error: 'Not found' });
  if (owner.rows[0].creator_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  await db.query(
    'UPDATE concept_projects SET footage_link=$1, updated_at=now() WHERE id=$2',
    [footage_link || null, req.params.id]
  );
  res.json({ footage_link: footage_link || null });
});

// PATCH advance status
router.patch('/:id/status', async (req, res) => {
  const concept = await db.query('SELECT * FROM concept_projects WHERE id=$1', [req.params.id]);
  if (!concept.rows.length) return res.status(404).json({ error: 'Not found' });
  const c = concept.rows[0];
  if (req.user.role === 'creator' && c.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // v21 Guide flow: explicit target status (e.g. mark a pending_upload concept
  // 'complete' when the creator confirms they've uploaded to Playbook).
  const VALID_TARGETS = ['pending_upload', 'complete'];
  if (req.body && VALID_TARGETS.includes(req.body.status)) {
    await db.query(
      'UPDATE concept_projects SET status=$1, updated_at=now() WHERE id=$2',
      [req.body.status, req.params.id]
    );
    return res.json({ status: req.body.status });
  }

  // Legacy linear advance: needs_shooting → ready_to_edit → done.
  const idx = STATUS_ORDER.indexOf(c.status);
  if (idx === STATUS_ORDER.length - 1) return res.status(400).json({ error: 'Already done' });
  const next = STATUS_ORDER[idx + 1];

  await db.query(
    'UPDATE concept_projects SET status=$1, updated_at=now() WHERE id=$2',
    [next, req.params.id]
  );
  res.json({ status: next });
});

// DELETE concept (creator owner or strategist). Hard delete — children
// (concept_copy_lines / concept_songs / concept_clip_structures) cascade.
router.delete('/:id', async (req, res) => {
  const owner = await db.query('SELECT creator_id FROM concept_projects WHERE id=$1', [req.params.id]);
  if (!owner.rows.length) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'creator' && owner.rows[0].creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  await db.query('DELETE FROM concept_projects WHERE id=$1', [req.params.id]);
  res.json({ deleted: req.params.id });
});

module.exports = router;
