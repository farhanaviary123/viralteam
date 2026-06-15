const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('strategist'));

router.get('/', async (req, res) => {
  // v7+ unified the clip library: "hooks" are just clips with is_hook=true,
  // so we count them off the clips table instead of the old hooks table.
  const [angles, formats, copyLines, songs, clips, hooks, structures, conceptsThisWeek] = await Promise.all([
    db.query('SELECT status, COUNT(*) FROM angles GROUP BY status'),
    db.query('SELECT status, COUNT(*) FROM formats GROUP BY status'),
    db.query('SELECT status, COUNT(*) FROM copy_lines GROUP BY status'),
    db.query('SELECT status, COUNT(*) FROM songs GROUP BY status'),
    db.query('SELECT status, COUNT(*) FROM clips GROUP BY status'),
    db.query('SELECT status, COUNT(*) FROM clips WHERE is_hook = true GROUP BY status'),
    db.query('SELECT status, COUNT(*) FROM clip_structures GROUP BY status'),
    db.query("SELECT COUNT(*) FROM concept_projects WHERE created_at >= now() - interval '7 days'"),
  ]);

  const toBuckets = (rows) => {
    const out = { active: 0, paused: 0, retired: 0 };
    for (const r of rows) out[r.status] = parseInt(r.count);
    return out;
  };

  res.json({
    angles: toBuckets(angles.rows),
    formats: toBuckets(formats.rows),
    copy_lines: toBuckets(copyLines.rows),
    songs: toBuckets(songs.rows),
    clips: toBuckets(clips.rows),
    hooks: toBuckets(hooks.rows),
    clip_structures: toBuckets(structures.rows),
    concepts_this_week: parseInt(conceptsThisWeek.rows[0].count),
  });
});

module.exports = router;
