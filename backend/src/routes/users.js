const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('strategist'));

// GET all creators with activity counts. Includes playbook_link (v19+) and
// drive_link (v23+), with graceful fallbacks if the columns haven't been
// migrated yet.
router.get('/creators', async (req, res) => {
  const sql = (linkCols) => `
    SELECT
      u.id, u.name, u.email, u.status, u.created_at${linkCols ? ', ' + linkCols : ''},
      COUNT(cp.id) FILTER (WHERE cp.status IS NOT NULL) AS concepts_built,
      COUNT(cp.id) FILTER (WHERE cp.status IN ('ready_to_edit','done')) AS concepts_shot,
      COUNT(cp.id) FILTER (WHERE cp.status = 'done') AS concepts_edited
    FROM users u
    LEFT JOIN concept_projects cp ON cp.creator_id = u.id
    WHERE u.role = 'creator'
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `;
  try {
    const { rows } = await db.query(sql('u.playbook_link, u.drive_link'));
    return res.json(rows);
  } catch (err) {
    if (err.code !== '42703') throw err;
    console.warn('[users GET /creators] drive_link missing — run migrate:v23');
  }
  try {
    const { rows } = await db.query(sql('u.playbook_link'));
    return res.json(rows);
  } catch (err) {
    if (err.code !== '42703') throw err;
    console.warn('[users GET /creators] playbook_link missing — run migrate:v19');
  }
  const { rows } = await db.query(sql(''));
  res.json(rows);
});

// PATCH /users/creators/:id — strategist-only. Lets the strategist set/clear a
// creator's playbook_link and/or drive_link (the two footage-upload targets).
// Only the keys present in the body are touched.
router.patch('/creators/:id', async (req, res) => {
  const has = k => Object.prototype.hasOwnProperty.call(req.body, k);
  const clean = v => (v ? String(v).trim() || null : null);
  // Confirm target is actually a creator (don't accidentally edit strategists).
  const owner = await db.query(
    "SELECT id FROM users WHERE id=$1 AND role='creator'",
    [req.params.id]
  );
  if (!owner.rows.length) return res.status(404).json({ error: 'Creator not found' });

  const sets = [];
  const vals = [];
  if (has('playbook_link')) { sets.push(`playbook_link=$${sets.length + 1}`); vals.push(clean(req.body.playbook_link)); }
  if (has('drive_link'))    { sets.push(`drive_link=$${sets.length + 1}`);    vals.push(clean(req.body.drive_link)); }

  if (sets.length) {
    vals.push(req.params.id);
    try {
      await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
    } catch (err) {
      if (err.code === '42703') {
        return res.status(503).json({ error: 'link column missing — run migrate:v19 / migrate:v23' });
      }
      throw err;
    }
  }

  // Return the updated row, falling back if drive_link isn't migrated yet.
  try {
    const { rows } = await db.query(
      'SELECT id, name, email, role, playbook_link, drive_link FROM users WHERE id=$1',
      [req.params.id]
    );
    return res.json(rows[0]);
  } catch (err) {
    if (err.code !== '42703') throw err;
    const { rows } = await db.query(
      'SELECT id, name, email, role, playbook_link FROM users WHERE id=$1',
      [req.params.id]
    );
    res.json(rows[0]);
  }
});

module.exports = router;
