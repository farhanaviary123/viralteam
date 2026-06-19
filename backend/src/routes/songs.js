const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { setVibes, attachVibes } = require('../lib/vibes');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM songs ORDER BY priority_weight DESC, created_at ASC'
  );
  const withVibes = await attachVibes(rows, 'song_vibes', 'song_id');
  res.json(withVibes);
});

router.post('/', requireRole('strategist'), async (req, res) => {
  const { name, link, tiktok_link, platform, priority_weight = 3, all_vibes = false, vibe_ids = [] } = req.body;
  if (!name || !link) return res.status(400).json({ error: 'Name and link required' });
  const plat = platform === 'ig' ? 'ig' : 'tiktok';
  let rows;
  try {
    ({ rows } = await db.query(
      'INSERT INTO songs (name, link, tiktok_link, platform, priority_weight, all_vibes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, link, tiktok_link || null, plat, priority_weight, all_vibes]
    ));
  } catch (err) {
    if (err.code !== '42703') throw err;
    // platform (v23) missing — retry without it.
    console.warn('[songs POST] platform column missing — run migrate:v23. Inserting without it.');
    try {
      ({ rows } = await db.query(
        'INSERT INTO songs (name, link, tiktok_link, priority_weight, all_vibes) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [name, link, tiktok_link || null, priority_weight, all_vibes]
      ));
    } catch (err2) {
      if (err2.code !== '42703') throw err2;
      // Pre-v19 fallback (no tiktok_link column yet).
      console.warn('[songs POST] tiktok_link column missing — run migrate:v19. Inserting without it.');
      ({ rows } = await db.query(
        'INSERT INTO songs (name, link, priority_weight, all_vibes) VALUES ($1,$2,$3,$4) RETURNING *',
        [name, link, priority_weight, all_vibes]
      ));
    }
  }
  await setVibes('song_vibes', 'song_id', rows[0].id, vibe_ids);
  const [withVibes] = await attachVibes(rows, 'song_vibes', 'song_id');
  res.status(201).json(withVibes);
});

router.patch('/:id', requireRole('strategist'), async (req, res) => {
  const { name, link, tiktok_link, platform, status, priority_weight, all_vibes, vibe_ids } = req.body;
  // Normalize platform: only 'ig' | 'tiktok' are valid; undefined leaves it unchanged.
  const plat = platform === undefined ? undefined : (platform === 'ig' ? 'ig' : 'tiktok');
  let rows;
  try {
    ({ rows } = await db.query(`
      UPDATE songs SET
        name = COALESCE($1, name),
        link = COALESCE($2, link),
        tiktok_link = COALESCE($3, tiktok_link),
        platform = COALESCE($4, platform),
        status = COALESCE($5, status),
        priority_weight = COALESCE($6, priority_weight),
        all_vibes = COALESCE($7, all_vibes),
        updated_at = now()
      WHERE id=$8 RETURNING *
    `, [name, link, tiktok_link, plat, status, priority_weight, all_vibes, req.params.id]));
  } catch (err) {
    if (err.code !== '42703') throw err;
    console.warn('[songs PATCH] platform column missing — run migrate:v23. Updating without it.');
    try {
      ({ rows } = await db.query(`
        UPDATE songs SET
          name = COALESCE($1, name),
          link = COALESCE($2, link),
          tiktok_link = COALESCE($3, tiktok_link),
          status = COALESCE($4, status),
          priority_weight = COALESCE($5, priority_weight),
          all_vibes = COALESCE($6, all_vibes),
          updated_at = now()
        WHERE id=$7 RETURNING *
      `, [name, link, tiktok_link, status, priority_weight, all_vibes, req.params.id]));
    } catch (err2) {
      if (err2.code !== '42703') throw err2;
      console.warn('[songs PATCH] tiktok_link column missing — run migrate:v19. Updating without it.');
      ({ rows } = await db.query(`
        UPDATE songs SET
          name = COALESCE($1, name),
          link = COALESCE($2, link),
          status = COALESCE($3, status),
          priority_weight = COALESCE($4, priority_weight),
          all_vibes = COALESCE($5, all_vibes),
          updated_at = now()
        WHERE id=$6 RETURNING *
      `, [name, link, status, priority_weight, all_vibes, req.params.id]));
    }
  }
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (vibe_ids !== undefined) {
    await setVibes('song_vibes', 'song_id', req.params.id, vibe_ids);
  }
  const [withVibes] = await attachVibes(rows, 'song_vibes', 'song_id');
  res.json(withVibes);
});

router.delete('/:id', requireRole('strategist'), async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM songs WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: req.params.id });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Cannot delete: song is referenced by existing concepts.' });
    }
    throw err;
  }
});

module.exports = router;
