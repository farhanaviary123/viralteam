// v18 migration — cascade arrangement deletes through concept_variations.
//
// concept_variations.clip_structure_id was created in v16 with ON DELETE
// RESTRICT, which blocked deleting a clip_structure that any concept had
// already used. Switch the FK to ON DELETE CASCADE so removing an
// arrangement cleanly drops it from those concepts' variation lists.

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT conname INTO fk_name
    FROM pg_constraint
   WHERE conrelid = 'concept_variations'::regclass
     AND contype = 'f'
     AND pg_get_constraintdef(oid) LIKE '%REFERENCES clip_structures(%';
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE concept_variations DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE concept_variations
  ADD CONSTRAINT concept_variations_clip_structure_id_fkey
  FOREIGN KEY (clip_structure_id) REFERENCES clip_structures(id) ON DELETE CASCADE;

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v18 migration complete.');
    console.log('   • concept_variations.clip_structure_id FK now ON DELETE CASCADE');
    process.exit(0);
  } catch (err) {
    console.error('v18 migration failed:', err);
    process.exit(1);
  }
})();
