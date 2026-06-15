const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const TIME_OF_DAY = ['morning', 'afternoon', 'evening', 'night'];
const LIGHTING    = ['natural', 'studio', 'dark'];
const LOCATION    = ['indoor', 'outdoor', 'on_the_go'];

function validateTags({ time_of_day, lighting, location }) {
  if (!TIME_OF_DAY.includes(time_of_day)) return `time_of_day must be one of ${TIME_OF_DAY.join(', ')}`;
  if (!LIGHTING.includes(lighting))       return `lighting must be one of ${LIGHTING.join(', ')}`;
  if (!LOCATION.includes(location))       return `location must be one of ${LOCATION.join(', ')}`;
  return null;
}

// Promote a single example to is_main, clearing any prior main on the same format.
// Wrapped in a transaction so the partial unique index never sees two trues.
async function promoteMain(client, exampleId, formatId) {
  await client.query('BEGIN');
  try {
    await client.query(
      'UPDATE format_examples SET is_main=false WHERE format_id=$1 AND id<>$2',
      [formatId, exampleId]
    );
    await client.query(
      'UPDATE format_examples SET is_main=true WHERE id=$1',
      [exampleId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

// LIST examples for a format — supports optional tag filters via query string.
// GET /api/formats/:formatId/examples?time_of_day=morning&lighting=natural&location=outdoor
router.get('/formats/:formatId/examples', async (req, res) => {
  const { formatId } = req.params;
  const { time_of_day, lighting, location } = req.query;

  const wheres = ['format_id = $1'];
  const params = [formatId];
  let p = 2;
  if (time_of_day) { wheres.push(`time_of_day = $${p++}`); params.push(time_of_day); }
  if (lighting)    { wheres.push(`lighting    = $${p++}`); params.push(lighting); }
  if (location)    { wheres.push(`location    = $${p++}`); params.push(location); }

  const { rows } = await db.query(
    `SELECT id, format_id, media_url, time_of_day, lighting, location, is_main, created_at
       FROM format_examples
      WHERE ${wheres.join(' AND ')}
      ORDER BY created_at DESC`,
    params
  );
  res.json(rows);
});

// CREATE example
// POST /api/formats/:formatId/examples
router.post('/formats/:formatId/examples', requireRole('strategist'), async (req, res) => {
  const { formatId } = req.params;
  const { media_url, time_of_day, lighting, location, is_main = false } = req.body;
  console.log('[formatExamples POST] formatId=', formatId, 'body=', req.body);
  if (!media_url) return res.status(400).json({ error: 'media_url is required' });
  const tagErr = validateTags({ time_of_day, lighting, location });
  if (tagErr) return res.status(400).json({ error: tagErr });

  let ins;
  try {
    ins = await db.query(
      `INSERT INTO format_examples (format_id, media_url, time_of_day, lighting, location, is_main)
       VALUES ($1,$2,$3,$4,$5,false) RETURNING *`,
      [formatId, media_url, time_of_day, lighting, location]
    );
  } catch (err) {
    console.error('[formatExamples POST] INSERT failed', err);
    return res.status(500).json({ error: err.message });
  }
  const example = ins.rows[0];
  console.log('[formatExamples POST] inserted row=', example);

  // Auto-promote when explicitly requested, OR when this is the first example
  // for the format (so the shoot-phase reference is always populated).
  let shouldPromote = !!is_main;
  if (!shouldPromote) {
    const existing = await db.query(
      'SELECT 1 FROM format_examples WHERE format_id=$1 AND is_main=true LIMIT 1',
      [formatId]
    );
    if (!existing.rows.length) shouldPromote = true;
  }
  if (shouldPromote) {
    const client = await db.getClient();
    try {
      await promoteMain(client, example.id, formatId);
    } finally {
      client.release();
    }
    example.is_main = true;
  }

  res.status(201).json(example);
});

// UPDATE example tags / promote main
// PATCH /api/format-examples/:id
router.patch('/format-examples/:id', requireRole('strategist'), async (req, res) => {
  const { id } = req.params;
  const { time_of_day, lighting, location, is_main } = req.body;

  // Validate any provided tag
  if (time_of_day !== undefined && !TIME_OF_DAY.includes(time_of_day)) {
    return res.status(400).json({ error: `time_of_day must be one of ${TIME_OF_DAY.join(', ')}` });
  }
  if (lighting !== undefined && !LIGHTING.includes(lighting)) {
    return res.status(400).json({ error: `lighting must be one of ${LIGHTING.join(', ')}` });
  }
  if (location !== undefined && !LOCATION.includes(location)) {
    return res.status(400).json({ error: `location must be one of ${LOCATION.join(', ')}` });
  }

  const head = await db.query('SELECT format_id FROM format_examples WHERE id=$1', [id]);
  if (!head.rows.length) return res.status(404).json({ error: 'Not found' });
  const formatId = head.rows[0].format_id;

  await db.query(`
    UPDATE format_examples SET
      time_of_day = COALESCE($1, time_of_day),
      lighting    = COALESCE($2, lighting),
      location    = COALESCE($3, location)
    WHERE id=$4
  `, [time_of_day, lighting, location, id]);

  if (is_main === true) {
    const client = await db.getClient();
    try {
      await promoteMain(client, id, formatId);
    } finally {
      client.release();
    }
  }
  // Note: we do NOT allow demoting the only main via is_main=false.
  // To "switch" main, the UI promotes a different example instead.

  const out = await db.query('SELECT * FROM format_examples WHERE id=$1', [id]);
  res.json(out.rows[0]);
});

// DELETE example
// DELETE /api/format-examples/:id
router.delete('/format-examples/:id', requireRole('strategist'), async (req, res) => {
  const { id } = req.params;
  const r = await db.query('DELETE FROM format_examples WHERE id=$1 RETURNING id', [id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: id });
});

module.exports = router;
