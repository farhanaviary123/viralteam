const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('strategist'));

// GET all creators with activity counts. Includes playbook_link (v19+),
// with a graceful fallback if the column hasn't been migrated yet.
router.get('/creators', async (req, res) => {
  const sql = (withPlaybook) => `
    SELECT
      u.id, u.name, u.email, u.status, u.created_at${withPlaybook ? ', u.playbook_link' : ''},
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
    const { rows } = await db.query(sql(true));
    res.json(rows);
  } catch (err) {
    if (err.code === '42703') {
      console.warn('[users GET /creators] playbook_link missing — run migrate:v19');
      const { rows } = await db.query(sql(false));
      res.json(rows);
    } else { throw err; }
  }
});

// PATCH /users/creators/:id — strategist-only. Currently lets the strategist
// set/clear a creator's playbook_link. Future fields can be added here.
router.patch('/creators/:id', async (req, res) => {
  const { playbook_link } = req.body;
  // Confirm target is actually a creator (don't accidentally edit strategists).
  const owner = await db.query(
    "SELECT id FROM users WHERE id=$1 AND role='creator'",
    [req.params.id]
  );
  if (!owner.rows.length) return res.status(404).json({ error: 'Creator not found' });
  try {
    await db.query(
      'UPDATE users SET playbook_link=$1 WHERE id=$2',
      [playbook_link ? String(playbook_link).trim() || null : null, req.params.id]
    );
  } catch (err) {
    if (err.code === '42703') {
      return res.status(503).json({ error: 'playbook_link column missing — run migrate:v19' });
    }
    throw err;
  }
  const { rows } = await db.query(
    'SELECT id, name, email, role, playbook_link FROM users WHERE id=$1',
    [req.params.id]
  );
  res.json(rows[0]);
});

module.exports = router;
