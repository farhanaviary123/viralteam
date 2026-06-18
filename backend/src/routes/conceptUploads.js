const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// In-memory, 50 MB per file — files are stored as bytea in Postgres, so keep
// them modest. Up to 10 files per request.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
});

async function loadConcept(id) {
  const { rows } = await db.query('SELECT id, creator_id FROM concept_projects WHERE id = $1', [id]);
  return rows[0] || null;
}

// POST /api/concepts/:id/uploads — creator uploads footage files (field: "files").
router.post('/concepts/:id/uploads', requireRole('creator'), upload.array('files', 10), async (req, res) => {
  const concept = await loadConcept(req.params.id);
  if (!concept) return res.status(404).json({ error: 'Not found' });
  if (concept.creator_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files provided (field name: "files")' });

  const saved = [];
  for (const f of req.files) {
    const { rows } = await db.query(
      `INSERT INTO concept_uploads (concept_id, filename, mime, size, data)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, filename, mime, size, created_at`,
      [concept.id, f.originalname || 'upload', f.mimetype || null, f.size, f.buffer]
    );
    saved.push(rows[0]);
  }
  res.status(201).json(saved);
});

// GET /api/concepts/:id/uploads — metadata list (no file bytes).
router.get('/concepts/:id/uploads', async (req, res) => {
  const concept = await loadConcept(req.params.id);
  if (!concept) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'creator' && concept.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { rows } = await db.query(
    `SELECT id, filename, mime, size, created_at
       FROM concept_uploads WHERE concept_id = $1 ORDER BY created_at ASC`,
    [req.params.id]
  );
  res.json(rows);
});

// GET /api/uploads/:uploadId/download — stream a single file. Creator (owner)
// or strategist.
router.get('/uploads/:uploadId/download', async (req, res) => {
  const { rows } = await db.query(
    `SELECT cu.filename, cu.mime, cu.data, cp.creator_id
       FROM concept_uploads cu
       JOIN concept_projects cp ON cp.id = cu.concept_id
      WHERE cu.id = $1`,
    [req.params.uploadId]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'creator' && row.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.setHeader('Content-Type', row.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${row.filename.replace(/"/g, '')}"`);
  res.send(row.data);
});

// DELETE /api/uploads/:uploadId — owner creator or strategist.
router.delete('/uploads/:uploadId', async (req, res) => {
  const { rows } = await db.query(
    `SELECT cu.id, cp.creator_id
       FROM concept_uploads cu JOIN concept_projects cp ON cp.id = cu.concept_id
      WHERE cu.id = $1`,
    [req.params.uploadId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'creator' && rows[0].creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  await db.query('DELETE FROM concept_uploads WHERE id = $1', [req.params.uploadId]);
  res.json({ deleted: req.params.uploadId });
});

// GET /api/concept-uploads/summary — strategist: concepts that have uploads,
// with file counts, for the Uploads page.
router.get('/concept-uploads/summary', requireRole('strategist'), async (req, res) => {
  const { rows } = await db.query(`
    SELECT cp.id AS concept_id, cp.title, cp.creative_path, cp.status,
           u.name AS creator_name,
           COUNT(cu.id)::int AS file_count,
           COALESCE(SUM(cu.size), 0)::bigint AS total_size,
           MAX(cu.created_at) AS last_upload
      FROM concept_uploads cu
      JOIN concept_projects cp ON cp.id = cu.concept_id
      JOIN users u ON u.id = cp.creator_id
     GROUP BY cp.id, u.name
     ORDER BY MAX(cu.created_at) DESC
  `);
  res.json(rows);
});

module.exports = router;
