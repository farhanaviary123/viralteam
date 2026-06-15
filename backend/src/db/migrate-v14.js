// v14 migration — clips.product_id (UUID) -> clips.product_ids (UUID[])
//
// A clip can now belong to multiple products. Empty array = "All products".
// Single-valued legacy product_id values are converted to single-element arrays;
// nulls become '{}'.

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

ALTER TABLE clips
  ADD COLUMN IF NOT EXISTS product_ids UUID[] NOT NULL DEFAULT '{}';

-- Backfill from legacy product_id (only if the old column still exists).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='clips' AND column_name='product_id'
  ) THEN
    UPDATE clips
       SET product_ids = ARRAY[product_id]
     WHERE product_id IS NOT NULL
       AND (product_ids IS NULL OR cardinality(product_ids) = 0);
  END IF;
END $$;

DROP INDEX IF EXISTS clips_product_id_idx;

ALTER TABLE clips DROP COLUMN IF EXISTS product_id;

CREATE INDEX IF NOT EXISTS clips_product_ids_gin ON clips USING GIN (product_ids);

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v14 migration complete.');
    console.log('   • clips.product_id (UUID) -> clips.product_ids (UUID[])');
    console.log('   • Legacy values backfilled; empty array = "All products"');
    process.exit(0);
  } catch (err) {
    console.error('v14 migration failed:', err);
    process.exit(1);
  }
})();
