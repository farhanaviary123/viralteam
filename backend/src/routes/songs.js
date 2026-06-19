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

// GET /api/songs/:id/download — proxy the song's audio file through the server
// so the browser saves it instead of opening the link. The source (e.g. an
// Instagram audio URL) blocks direct cross-origin fetch from the browser, so we
// pull it server-side (no CORS) and re-stream it as an attachment.
router.get('/:id/download', async (req, res) => {
  const { rows } = await db.query('SELECT name, link FROM songs WHERE id=$1', [req.params.id]);
  const song = rows[0];
  if (!song || !song.link) return res.status(404).json({ error: 'Not found' });

  let upstream;
  try {
    upstream = await fetch(song.link, { redirect: 'follow' });
  } catch (err) {
    console.error('[songs download] fetch failed', song.link, err);
    return res.status(502).json({ error: 'Could not fetch audio source' });
  }
  if (!upstream.ok || !upstream.body) {
    return res.status(502).json({ error: `Audio source returned ${upstream.status}` });
  }

  const mime = upstream.headers.get('content-type') || 'audio/mpeg';
  const ext = (song.link.match(/\.(mp3|wav|m4a|aac|ogg|oga)(?:\?|$)/i)?.[1]) || 'mp3';
  const filename = `${(song.name || 'song').replace(/[^a-z0-9-_]+/gi, '_')}.${ext}`;
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // Stream the upstream body to the client (Node 18+ web stream → Node stream).
  const { Readable } = require('stream');
  Readable.fromWeb(upstream.body).pipe(res);
});

module.exports = router;
