// v24 migration —
//   • song_audio table — stores uploaded MP3 (and other audio) bytes directly
//     in Postgres instead of an external service (Cloudinary). A song's `link`
//     points at /api/songs/audio/<id>, which streams these bytes back.
//     Self-contained: no Cloudinary credentials required to upload songs.

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

CREATE TABLE IF NOT EXISTS song_audio (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data       BYTEA NOT NULL,
  mime       TEXT NOT NULL DEFAULT 'audio/mpeg',
  filename   TEXT,
  size       INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v24 migration complete.');
    console.log('   • song_audio table added (in-DB MP3 storage)');
    process.exit(0);
  } catch (err) {
    console.error('v24 migration failed:', err);
    process.exit(1);
  }
})();
