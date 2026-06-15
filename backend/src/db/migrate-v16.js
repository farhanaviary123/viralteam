// v16 migration — creator-picked variation count + per-variation arrangement picks.
//
// The creator now chooses how many variations they want (1–5). The randomiser
// picks N arrangements with repetition, weighted. Each pick is one row in
// `concept_variations` (ordered by position 1..N).

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

ALTER TABLE concept_projects
  ADD COLUMN IF NOT EXISTS variation_count INT NOT NULL DEFAULT 5;

CREATE TABLE IF NOT EXISTS concept_variations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id        UUID NOT NULL REFERENCES concept_projects(id) ON DELETE CASCADE,
  clip_structure_id UUID NOT NULL REFERENCES clip_structures(id) ON DELETE RESTRICT,
  position          INT NOT NULL,
  UNIQUE (concept_id, position)
);

CREATE INDEX IF NOT EXISTS concept_variations_concept_idx
  ON concept_variations(concept_id);

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v16 migration complete.');
    console.log('   • concept_projects.variation_count added (default 5)');
    console.log('   • concept_variations table created');
    process.exit(0);
  } catch (err) {
    console.error('v16 migration failed:', err);
    process.exit(1);
  }
})();
