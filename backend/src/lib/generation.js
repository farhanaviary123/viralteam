// Generation engine — v8
//
// At concept creation, returns:
//   { angle_id, copy_line_ids[5], song_ids[5],
//     hook_clip_id, clip_structure_id, preset_concept_id|null }
//
// Hook: pick exactly ONE active hook clip from the format's clip pool
// (weighted). The shot list always shoots that hook ×5 (handled by the read
// side via takes=5).
//
// Body: pick ONE active clip_structure (arrangement) from the format
// (weighted by priority… here just uniform random since structures don't have
// a weight column).
//
// All per-clip multiplier / variation_safe logic from v7 is gone. Takes now
// live on each clip_structure_item.

const db = require('../db');

const RANDOM_ENGINE_WEIGHT = Number(process.env.RANDOM_ENGINE_WEIGHT) || 5;

// ── Generic helpers ──────────────────────────────────────────────────

function weightedPick(items) {
  // Coerce to Number — pg returns NUMERIC columns as strings, which would
  // otherwise turn `s + w(it)` into string concatenation and silently break
  // weighting (collapsing to "pick the first item every time").
  const w = it => {
    const raw = it.weight ?? it.priority_weight ?? 1;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };
  const total = items.reduce((s, it) => s + w(it), 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let r = Math.random() * total;
  for (const it of items) {
    r -= w(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function weightedPick5(items) {
  return weightedPickN(items, 5);
}

function weightedPickN(items, n) {
  return Array.from({ length: n }, () => weightedPick(items).id);
}

// Like weightedPickN but exhausts unique items before repeating. Each pass
// is a weighted draw WITHOUT replacement so higher-weight items still come
// out first; only after every distinct item has been picked once do we start
// a fresh pass.
function weightedPickNUnique(items, n) {
  const picks = [];
  let pool = items.slice();
  while (picks.length < n) {
    if (pool.length === 0) pool = items.slice();
    const chosen = weightedPick(pool);
    picks.push(chosen.id);
    pool = pool.filter(it => it.id !== chosen.id);
  }
  return picks;
}

function filterByVibes(rows, contextVibeIds) {
  if (!contextVibeIds || contextVibeIds.length === 0) return rows;
  const ctx = new Set(contextVibeIds);
  return rows.filter(r => {
    if (r.all_vibes) return true;
    if (!r.vibe_ids || r.vibe_ids.length === 0) return false;
    return r.vibe_ids.some(v => ctx.has(v));
  });
}

function filterByVibesOrFallback(rows, contextVibeIds) {
  const filtered = filterByVibes(rows, contextVibeIds);
  return filtered.length ? filtered : rows;
}

function pickRandom(arr) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

async function loadFormatContext(formatId) {
  const fmt = await db.query(
    `SELECT id, required_copy_type, status, all_vibes
       FROM formats WHERE id=$1`,
    [formatId]
  );
  if (!fmt.rows.length) throw new Error('Format not found');
  if (fmt.rows[0].status !== 'active') throw new Error('Format is not active');

  const v = await db.query(
    `SELECT vibe_id FROM format_vibes WHERE format_id=$1`,
    [formatId]
  );
  return {
    format: fmt.rows[0],
    vibeIds: v.rows.map(r => r.vibe_id),
  };
}

// ── Hook + arrangement pickers ───────────────────────────────────────

async function pickHookClip(formatId, productId = null) {
  // v15: hooks are scoped per-format via the format_hooks join table.
  // If a format has zero rows in format_hooks, fall back to ALL active hooks
  // (so legacy formats keep working).
  console.log('[gen.pickHookClip] formatId=', formatId, 'productId=', productId);

  let hasConfigured = false;
  let configuredCount = 0;
  try {
    const cfg = await db.query(
      'SELECT COUNT(*)::int AS n FROM format_hooks WHERE format_id=$1',
      [formatId]
    );
    configuredCount = cfg.rows[0].n;
    hasConfigured = configuredCount > 0;
  } catch (err) {
    if (err.code === '42P01') {
      console.warn('[gen.pickHookClip] format_hooks missing — falling back to all active hooks');
    } else { throw err; }
  }
  console.log('[gen.pickHookClip] format_hooks configured=', hasConfigured, '(count=', configuredCount, ')');

  const hookFilter = hasConfigured
    ? `AND EXISTS (SELECT 1 FROM format_hooks fh WHERE fh.format_id = $2 AND fh.clip_id = c.id)`
    : '';
  const r = await db.query(`
    SELECT c.id, c.name, c.product_ids, c.weight
      FROM clips c
     WHERE c.status = 'active'
       AND c.is_hook = true
       AND ($1::uuid IS NULL
            OR cardinality(c.product_ids) = 0
            OR $1::uuid = ANY(c.product_ids))
       ${hookFilter}
  `, hasConfigured ? [productId, formatId] : [productId]);
  console.log('[gen.pickHookClip] candidates=', r.rows.map(x => ({ id: x.id, name: x.name, product_ids: x.product_ids })));
  if (r.rows.length) {
    const picked = weightedPick(r.rows);
    console.log('[gen.pickHookClip] picked=', { id: picked.id, name: picked.name, product_ids: picked.product_ids });
    return picked.id;
  }
  // Fallback: no product-eligible hook. Drop product filter but still
  // respect the format's configured hooks (if any).
  const fallbackFilter = hasConfigured
    ? `AND EXISTS (SELECT 1 FROM format_hooks fh WHERE fh.format_id = $1 AND fh.clip_id = c.id)`
    : '';
  const all = await db.query(`
    SELECT c.id, c.name, c.product_ids, c.weight
      FROM clips c
     WHERE c.status = 'active' AND c.is_hook = true
       ${fallbackFilter}
  `, hasConfigured ? [formatId] : []);
  console.log('[gen.pickHookClip] FALLBACK any-product candidates=', all.rows.map(x => ({ id: x.id, name: x.name, product_ids: x.product_ids })));
  if (!all.rows.length) return null;
  const picked = weightedPick(all.rows);
  console.log('[gen.pickHookClip] picked (fallback)=', { id: picked.id, name: picked.name, product_ids: picked.product_ids });
  return picked.id;
}

async function pickClipStructures(formatId, productId = null, n = 1) {
  console.log('[gen.pickClipStructures] formatId=', formatId, 'productId=', productId, 'n=', n);
  // Score every active structure for this format by how many of its items are
  // product-compatible (clip.product_ids empty = "All products", or contains
  // productId), then pick from the highest-scoring tier. Off-product items are
  // surfaced via off_product_count so the read side can hide them.
  const r = await db.query(`
    SELECT
      cs.id,
      cs.name,
      COUNT(*) FILTER (
        WHERE $2::uuid IS NULL
           OR cardinality(c.product_ids) = 0
           OR $2::uuid = ANY(c.product_ids)
      ) AS matching_count,
      COUNT(*) FILTER (
        WHERE $2::uuid IS NOT NULL
          AND cardinality(c.product_ids) > 0
          AND NOT ($2::uuid = ANY(c.product_ids))
      ) AS off_product_count,
      COUNT(*) AS total_count
    FROM clip_structures cs
    LEFT JOIN clip_structure_items csi ON csi.clip_structure_id = cs.id
    LEFT JOIN clips c ON c.id = csi.clip_id
    WHERE cs.format_id = $1 AND cs.status = 'active'
    GROUP BY cs.id, cs.name
  `, [formatId, productId]);
  console.log('[gen.pickClipStructures] scored structures=',
    r.rows.map(x => ({
      id: x.id, name: x.name,
      matching: Number(x.matching_count),
      off: Number(x.off_product_count),
      total: Number(x.total_count),
    }))
  );
  if (!r.rows.length) return [];

  // Pool: ALL active arrangements for the format. Previously we restricted to
  // the highest matching_count tier which collapsed the pool to one structure
  // whenever the others had any off-product clip. Off-product items are
  // filtered out at read time anyway, so every arrangement is a valid pick.
  // We still PREFER higher matching_count by stratifying into tiers and
  // walking the best tier first before falling to lower ones.
  const byScore = new Map();
  for (const row of r.rows) {
    const score = Number(row.matching_count);
    if (!byScore.has(score)) byScore.set(score, []);
    byScore.get(score).push(row);
  }
  const tiers = [...byScore.keys()].sort((a, b) => b - a).map(s => byScore.get(s));
  console.log('[gen.pickClipStructures] tier sizes (best→worst):',
    tiers.map((t, i) => ({ rank: i, score: Number(t[0].matching_count), n: t.length }))
  );

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Walk each tier in score order (shuffled within tier). Once all tiers
  // exhausted, start over from the best tier. This guarantees we use every
  // distinct arrangement before any repeat, while still biasing the first
  // picks toward the best product fit.
  const picks = [];
  while (picks.length < n) {
    for (const tier of tiers) {
      const bag = shuffle(tier);
      for (const item of bag) {
        if (picks.length >= n) break;
        picks.push(item.id);
      }
      if (picks.length >= n) break;
    }
  }
  console.log('[gen.pickClipStructures] picks=', picks);
  return picks;
}

// ── Preset path ──────────────────────────────────────────────────────

async function loadCandidatePresets(formatId, contextVibeIds) {
  const presets = await db.query(`
    SELECT p.id, p.priority_weight, p.angle_id, p.all_vibes
    FROM preset_concepts p
    WHERE p.format_id=$1 AND p.status='active'
  `, [formatId]);
  if (!presets.rows.length) return [];

  const ids = presets.rows.map(r => r.id);
  const v = await db.query(
    `SELECT preset_concept_id, vibe_id FROM preset_concept_vibes WHERE preset_concept_id = ANY($1::uuid[])`,
    [ids]
  );
  const byPreset = new Map();
  for (const j of v.rows) {
    if (!byPreset.has(j.preset_concept_id)) byPreset.set(j.preset_concept_id, []);
    byPreset.get(j.preset_concept_id).push(j.vibe_id);
  }
  const annotated = presets.rows.map(p => ({ ...p, vibe_ids: byPreset.get(p.id) || [] }));
  return filterByVibesOrFallback(annotated, contextVibeIds);
}

async function loadPresetAssignment(presetId, formatId, productId = null, variationCount = 5) {
  const copy = await db.query(
    `SELECT copy_line_id, position FROM preset_concept_copy_lines
     WHERE preset_concept_id=$1 ORDER BY position`,
    [presetId]
  );
  const songs = await db.query(
    `SELECT song_id, position FROM preset_concept_songs
     WHERE preset_concept_id=$1 ORDER BY position`,
    [presetId]
  );
  const head = await db.query(
    `SELECT angle_id FROM preset_concepts WHERE id=$1`,
    [presetId]
  );
  if (!head.rows.length) throw new Error('Preset concept disappeared');

  const hook_clip_id        = await pickHookClip(formatId, productId);
  const clip_structure_ids  = await pickClipStructures(formatId, productId, variationCount);

  // Truncate or extend copy/song lists to variationCount. Presets define up
  // to 5; if the creator asked for fewer we just slice. If more were asked
  // than the preset defines, re-cycle the available ones.
  const sliceN = (arr) => {
    if (!arr.length) return [];
    return Array.from({ length: variationCount }, (_, i) => arr[i % arr.length]);
  };

  return {
    angle_id: head.rows[0].angle_id,
    copy_line_ids: sliceN(copy.rows.map(r => r.copy_line_id)),
    song_ids: sliceN(songs.rows.map(r => r.song_id)),
    hook_clip_id,
    clip_structure_ids,
    preset_concept_id: presetId,
  };
}

// ── Randomised path ──────────────────────────────────────────────────

async function generateRandomised(formatId, contextVibeIds, requiredCopyTypes, productId = null, variationCount = 5) {
  // v10: requiredCopyTypes is an array (e.g. ['single_headline','multi_headline'])
  // v12: productId filters copy_lines (product_ids '{}' = all, or contains productId)
  const types = Array.isArray(requiredCopyTypes) ? requiredCopyTypes : [requiredCopyTypes];
  // v20: exclude archived angles + copy lines from the randomiser pool. Pre-v20
  // dbs (missing `archived` column) gracefully fall back to the unfiltered
  // query so generation keeps working until the migration is run.
  const angleSql = (withArchived) => `
    SELECT a.id, a.name, a.priority_weight, a.all_vibes,
      COALESCE(
        ARRAY(SELECT vibe_id FROM angle_vibes WHERE angle_id=a.id),
        ARRAY[]::uuid[]
      ) AS vibe_ids
    FROM angles a
    WHERE a.status = 'active'
      ${withArchived ? 'AND COALESCE(a.archived, FALSE) = FALSE' : ''}
      AND EXISTS (
        SELECT 1 FROM angle_format_compatibility afc
         WHERE afc.angle_id = a.id AND afc.format_id = $1
      )
      AND EXISTS (
        SELECT 1 FROM copy_lines cl
         WHERE cl.angle_id = a.id
           AND cl.status = 'active'
           ${withArchived ? 'AND COALESCE(cl.archived, FALSE) = FALSE' : ''}
           AND cl.copy_type = ANY($2::text[])
           AND ($3::uuid IS NULL
                OR cardinality(cl.product_ids) = 0
                OR $3::uuid = ANY(cl.product_ids))
      )
  `;
  let angleRes;
  try {
    angleRes = await db.query(angleSql(true), [formatId, types, productId]);
  } catch (err) {
    if (err.code !== '42703') throw err;
    console.warn('[gen] archived column missing — run migrate:v20');
    angleRes = await db.query(angleSql(false), [formatId, types, productId]);
  }
  if (!angleRes.rows.length) {
    throw new Error('No eligible angle: this format has no compatible active angles with matching copy lines');
  }
  console.log('[gen.angle] eligible pool=',
    angleRes.rows.map(a => ({
      id: a.id, name: a.name,
      priority_weight: a.priority_weight,
      all_vibes: a.all_vibes,
      vibe_match: a.all_vibes || a.vibe_ids?.some(v => contextVibeIds.includes(v)) || false,
    }))
  );

  // SOFT vibe preference: every eligible angle stays in the pool so its weight
  // can earn it a shot. Angles matching the format's vibes get a 2× boost so
  // they're still preferred when present.
  const ctxSet = new Set(contextVibeIds || []);
  const anglePool = angleRes.rows.map(a => {
    const vibeMatch = a.all_vibes || (a.vibe_ids || []).some(v => ctxSet.has(v));
    const base = Number(a.priority_weight) || 1;
    return { ...a, weight: vibeMatch ? base * 2 : base };
  });
  console.log('[gen.angle] effective weights=',
    anglePool.map(a => ({ name: a.name, weight: a.weight }))
  );
  const angle = weightedPick(anglePool);
  const angleId = angle.id;
  console.log('[gen.angle] picked=', { id: angle.id, name: angle.name, weight: angle.weight });

  // v20: also exclude archived copy lines from the per-angle pool.
  const copySql = (withArchived) => `
    SELECT cl.id, cl.priority_weight, cl.all_vibes,
      COALESCE(
        ARRAY(SELECT vibe_id FROM copy_line_vibes WHERE copy_line_id=cl.id),
        ARRAY[]::uuid[]
      ) AS vibe_ids
    FROM copy_lines cl
    WHERE cl.angle_id=$1
      AND cl.copy_type = ANY($2::text[])
      AND cl.status='active'
      ${withArchived ? 'AND COALESCE(cl.archived, FALSE) = FALSE' : ''}
      AND ($3::uuid IS NULL
           OR cardinality(cl.product_ids) = 0
           OR $3::uuid = ANY(cl.product_ids))
  `;
  let copyRes;
  try {
    copyRes = await db.query(copySql(true), [angleId, types, productId]);
  } catch (err) {
    if (err.code !== '42703') throw err;
    copyRes = await db.query(copySql(false), [angleId, types, productId]);
  }
  if (!copyRes.rows.length) throw new Error('No active copy lines for chosen angle');
  const pairCtx = Array.from(new Set([...(angle.vibe_ids || []), ...contextVibeIds]));
  const copyPool = filterByVibesOrFallback(copyRes.rows, pairCtx);
  const copyLineIds = weightedPickNUnique(copyPool, variationCount);

  const songRes = await db.query(`
    SELECT s.id, s.priority_weight, s.all_vibes,
      COALESCE(
        ARRAY(SELECT vibe_id FROM song_vibes WHERE song_id=s.id),
        ARRAY[]::uuid[]
      ) AS vibe_ids
    FROM songs s WHERE s.status='active'
  `);
  if (!songRes.rows.length) throw new Error('No active songs in the pool');
  const songPool = filterByVibesOrFallback(songRes.rows, contextVibeIds);
  const songIds = weightedPickN(songPool, variationCount);

  const hook_clip_id       = await pickHookClip(formatId, productId);
  const clip_structure_ids = await pickClipStructures(formatId, productId, variationCount);

  return {
    angle_id: angleId,
    copy_line_ids: copyLineIds,
    song_ids: songIds,
    hook_clip_id,
    clip_structure_ids,
    preset_concept_id: null,
  };
}

// ── Entry point ──────────────────────────────────────────────────────

async function generateConcept(formatId, productId = null, variationCount = 5) {
  const n = Math.max(1, Math.min(5, Number(variationCount) || 5));
  console.log('[gen.generateConcept] formatId=', formatId, 'productId=', productId, 'variationCount=', n);
  const { format, vibeIds } = await loadFormatContext(formatId);

  const presets = await loadCandidatePresets(formatId, vibeIds);
  const pool = [
    ...presets.map(p => ({ kind: 'preset', id: p.id, weight: p.priority_weight })),
    { kind: 'random', id: 'RANDOM', weight: RANDOM_ENGINE_WEIGHT },
  ];

  const drawn = weightedPick(pool);
  console.log('[gen.generateConcept] drawn engine=', drawn.kind, drawn.id);

  if (drawn.kind === 'preset') {
    return loadPresetAssignment(drawn.id, formatId, productId, n);
  }
  return generateRandomised(formatId, vibeIds, format.required_copy_type, productId, n);
}

module.exports = {
  generateConcept,
  weightedPick,
  weightedPick5,
  filterByVibes,
  filterByVibesOrFallback,
};
