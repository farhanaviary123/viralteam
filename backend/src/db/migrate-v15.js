// v15 migration — per-format eligible hook clips.
//
// Strategists can now pick which hook clips are eligible for each format.
// If a format has no rows in format_hooks, generation falls back to ALL
// active hooks (so existing formats keep working).

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

CREATE TABLE IF NOT EXISTS format_hooks (
  format_id UUID NOT NULL REFERENCES formats(id) ON DELETE CASCADE,
  clip_id   UUID NOT NULL REFERENCES clips(id)   ON DELETE CASCADE,
  PRIMARY KEY (format_id, clip_id)
);

CREATE INDEX IF NOT EXISTS format_hooks_clip_idx ON format_hooks(clip_id);

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v15 migration complete.');
    console.log('   • format_hooks table created');
    process.exit(0);
  } catch (err) {
    console.error('v15 migration failed:', err);
    process.exit(1);
  }
})();
