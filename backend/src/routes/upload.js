const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const FOLDER = process.env.CLOUDINARY_FOLDER || 'scalemaxxing';
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

let configured = false;
if (CLOUD_NAME && API_KEY && API_SECRET) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true,
  });
  configured = true;
} else {
  console.warn('[upload] CLOUDINARY_* env vars missing — /api/upload disabled');
}

// 500 MB cap, in-memory — large enough for raw video uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

function uploadBufferToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    stream.end(buffer);
  });
}

router.post('/', requireRole('strategist'), upload.single('file'), async (req, res) => {
  if (!configured) {
    return res.status(503).json({ error: 'Upload service not configured (set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).' });
  }
  if (!req.file) return res.status(400).json({ error: 'No file provided (field name: "file")' });

  const original = req.file.originalname || 'upload';
  const ext = (path.extname(original) || '').toLowerCase();
  const safeBase = path.basename(original, ext).replace(/[^a-z0-9-_]/gi, '_').slice(0, 40) || 'media';
  const publicId = `${safeBase}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  try {
    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: FOLDER,
      public_id: publicId,
      resource_type: 'auto',   // handles image, gif, video, etc.
      overwrite: false,
    });

    res.status(201).json({
      url: result.secure_url,
      key: result.public_id,        // full path incl. folder, e.g. scalemaxxing/foo-123-abcd
      bucket: FOLDER,
      mime: req.file.mimetype,
      size: req.file.size,
      width: result.width,
      height: result.height,
      format: result.format,
    });
  } catch (err) {
    console.error('[upload] cloudinary error:', err);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

module.exports = router;
