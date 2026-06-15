// v12 migration — Products
//
// • New `products` table (id, name, image_url, status, created_at).
// • concept_projects.product_id (nullable) — picked by creator at concept time.
// • copy_lines.product_ids UUID[] (default '{}') — empty = applies to all products.
// • clips.product_id (nullable) — null = applies to all products.

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

CREATE TABLE IF NOT EXISTS products (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  image_url  TEXT,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE concept_projects
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

ALTER TABLE copy_lines
  ADD COLUMN IF NOT EXISTS product_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE clips
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clips_product_id_idx ON clips(product_id);
CREATE INDEX IF NOT EXISTS concept_projects_product_id_idx ON concept_projects(product_id);

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v12 migration complete.');
    console.log('   • products table created');
    console.log('   • concept_projects.product_id added');
    console.log('   • copy_lines.product_ids (UUID[]) added');
    console.log('   • clips.product_id added');
    process.exit(0);
  } catch (err) {
    console.error('v12 migration failed:', err);
    process.exit(1);
  }
})();
