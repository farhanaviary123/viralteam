// v20 migration — soft-delete (archive) flag for angles + copy lines.
// Strategist board hides archived rows; existing concepts that reference
// archived rows are unaffected (lookups still resolve by id).

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

ALTER TABLE angles
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE copy_lines
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v20 migration complete.');
    console.log('   • angles.archived added (default false)');
    console.log('   • copy_lines.archived added (default false)');
    process.exit(0);
  } catch (err) {
    console.error('v20 migration failed:', err);
    process.exit(1);
  }
})();
