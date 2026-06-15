// v11 migration — clip_examples table
//
// Mirrors format_examples but simpler: a clip can have N example media,
// each with an optional label. No tagging, no "is_main" flag — the first
// example (oldest) acts as the primary in the UI.

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

CREATE TABLE IF NOT EXISTS clip_examples (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id    UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  label      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clip_examples_clip_id_idx
  ON clip_examples(clip_id);

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v11 migration complete.');
    console.log('   • clip_examples table created');
    process.exit(0);
  } catch (err) {
    console.error('v11 migration failed:', err);
    process.exit(1);
  }
})();
