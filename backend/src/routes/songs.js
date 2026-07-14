const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { setVibes, attachVibes } = require('../lib/vibes');
const { Readable, pipeline } = require('stream');
const { promisify } = require('util');

const pipelineAsync = promisify(pipeline);

const router = express.Router();

// In-DB audio upload (20 MB cap — plenty for an MP3 clip).
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// GET /api/songs/audio/:id — stream stored audio bytes. Public (no auth):
// the browser <audio> tag and direct download links can't send a Bearer
// header. Registered before the authenticate gate below.
router.get('/audio/:id', async (req, res) => {
  let rows;
  try {
    ({ rows } = await db.query('SELECT data, mime FROM song_audio WHERE id=$1', [req.params.id]));
  } catch (err) {
    if (err.code === '42P01') return res.status(404).end();
    throw err;
  }
  const audio = rows[0];
  if (!audio) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', audio.mime || 'audio/mpeg');
  res.setHeader('Content-Length', audio.data.length);
  res.setHeader('Content-Disposition', 'inline');
  res.send(audio.data);
});

router.use(authenticate);

// POST /api/songs/audio — strategist uploads an MP3; bytes stored in Postgres
// (song_audio). Returns { url } pointing at the stream route above, matching
// the shape the song form expects for `link`.
router.post('/audio', requireRole('strategist'), audioUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided (field name: "file")' });
  try {
    const { rows } = await db.query(
      'INSERT INTO song_audio (data, mime, filename, size) VALUES ($1,$2,$3,$4) RETURNING id',
      [req.file.buffer, req.file.mimetype || 'audio/mpeg', req.file.originalname || null, req.file.size]
    );
    res.status(201).json({ url: `/api/songs/audio/${rows[0].id}`, mime: req.file.mimetype, size: req.file.size });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ error: 'Audio storage missing — run migrate:v24.' });
    }
    throw err;
  }
});

router.get('/', async (req, res) => {
  let rows;
  try {
    ({ rows } = await db.query(
      'SELECT * FROM songs ORDER BY high_potential DESC, priority_weight DESC, created_at ASC'
    ));
  } catch (err) {
    if (err.code !== '42703') throw err;
    // high_potential column missing (pre-v26) — degrade gracefully.
    ({ rows } = await db.query(
      'SELECT * FROM songs ORDER BY priority_weight DESC, created_at ASC'
    ));
  }
  const withVibes = await attachVibes(rows, 'song_vibes', 'song_id');
  res.json(withVibes);
});

router.post('/', requireRole('strategist'), async (req, res) => {
  const { name, link, tiktok_link, platform, priority_weight = 3, all_vibes = false, vibe_ids = [], high_potential = false, added_date } = req.body;
  if (!name || !link) return res.status(400).json({ error: 'Name and link required' });
  const plat = platform === 'ig' ? 'ig' : 'tiktok';
  let rows;
  try {
    ({ rows } = await db.query(
      'INSERT INTO songs (name, link, tiktok_link, platform, priority_weight, all_vibes, high_potential, added_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [name, link, tiktok_link || null, plat, priority_weight, all_vibes, !!high_potential, added_date || null]
    ));
  } catch (err) {
    if (err.code !== '42703') throw err;
    // high_potential/added_date (v26) or platform (v23) missing — retry progressively.
    console.warn('[songs POST] v26 columns missing — run migrate:v26. Inserting without them.');
    try {
      ({ rows } = await db.query(
        'INSERT INTO songs (name, link, tiktok_link, platform, priority_weight, all_vibes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [name, link, tiktok_link || null, plat, priority_weight, all_vibes]
      ));
    } catch (err2) {
      if (err2.code !== '42703') throw err2;
      console.warn('[songs POST] platform column missing — run migrate:v23. Inserting without it.');
      try {
        ({ rows } = await db.query(
          'INSERT INTO songs (name, link, tiktok_link, priority_weight, all_vibes) VALUES ($1,$2,$3,$4,$5) RETURNING *',
          [name, link, tiktok_link || null, priority_weight, all_vibes]
        ));
      } catch (err3) {
        if (err3.code !== '42703') throw err3;
        // Pre-v19 fallback (no tiktok_link column yet).
        console.warn('[songs POST] tiktok_link column missing — run migrate:v19. Inserting without it.');
        ({ rows } = await db.query(
          'INSERT INTO songs (name, link, priority_weight, all_vibes) VALUES ($1,$2,$3,$4) RETURNING *',
          [name, link, priority_weight, all_vibes]
        ));
      }
    }
  }
  await setVibes('song_vibes', 'song_id', rows[0].id, vibe_ids);
  const [withVibes] = await attachVibes(rows, 'song_vibes', 'song_id');
  res.status(201).json(withVibes);
});

router.patch('/:id', requireRole('strategist'), async (req, res) => {
  const { name, link, tiktok_link, platform, status, priority_weight, all_vibes, vibe_ids, high_potential, added_date } = req.body;
  // Normalize platform: only 'ig' | 'tiktok' are valid; undefined leaves it unchanged.
  const plat = platform === undefined ? undefined : (platform === 'ig' ? 'ig' : 'tiktok');
  const hpParam = high_potential === undefined ? null : !!high_potential;
  // added_date: null means "clear it", undefined means "leave unchanged".
  const dateParam = added_date === undefined ? undefined : (added_date || null);
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
        high_potential = COALESCE($8, high_potential),
        added_date = COALESCE($9, added_date),
        updated_at = now()
      WHERE id=$10 RETURNING *
    `, [name, link, tiktok_link, plat, status, priority_weight, all_vibes, hpParam, dateParam, req.params.id]));
  } catch (err) {
    if (err.code !== '42703') throw err;
    // high_potential/added_date (v26) missing — retry without them.
    console.warn('[songs PATCH] v26 columns missing — run migrate:v26. Updating without them.');
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
    } catch (err2) {
      if (err2.code !== '42703') throw err2;
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
      } catch (err3) {
        if (err3.code !== '42703') throw err3;
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

  // In-DB audio: link is our own stream path (/api/songs/audio/<id>). Read the
  // bytes straight from song_audio instead of HTTP-fetching ourselves.
  const localMatch = song.link.match(/\/api\/songs\/audio\/([0-9a-f-]+)/i);
  if (localMatch) {
    const { rows: ar } = await db.query('SELECT data, mime FROM song_audio WHERE id=$1', [localMatch[1]]);
    const audio = ar[0];
    if (!audio) return res.status(404).json({ error: 'Audio not found' });
    const filename = `${(song.name || 'song').replace(/[^a-z0-9-_]+/gi, '_')}.mp3`;
    res.setHeader('Content-Type', audio.mime || 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(audio.data);
  }

  let upstream;
  try {
    upstream = await fetch(song.link, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
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
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) {
    res.setHeader('Content-Length', contentLength);
  }

  try {
    await pipelineAsync(Readable.fromWeb(upstream.body), res);
  } catch (err) {
    console.error('[songs download] stream error', song.link, err);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Audio stream failed' });
    } else {
      res.destroy(err);
    }
  }
});

module.exports = router;
