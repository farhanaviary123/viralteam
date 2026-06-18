// v22 migration — in-app footage uploads (replaces the Playbook link flow).
//
// Creators upload their raw clips + edited videos directly in the Guide wizard's
// Finish step. Files are stored in Postgres as bytea on concept_uploads, keyed
// to the concept. The strategist downloads them from the Uploads page.
//
// NOTE: storing video in the DB is only sane for modest files — the upload
// endpoint caps each file at 50 MB. Larger footage should move to object
// storage later.

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

CREATE TABLE IF NOT EXISTS concept_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id UUID NOT NULL REFERENCES concept_projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime TEXT,
  size INTEGER NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concept_uploads_concept ON concept_uploads(concept_id);

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v22 migration complete.');
    console.log('   • concept_uploads table created (bytea file storage)');
    process.exit(0);
  } catch (err) {
    console.error('v22 migration failed:', err);
    process.exit(1);
  }
})();
