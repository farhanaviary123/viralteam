// v25 migration —
//   • copy_lines.high_potential BOOLEAN — flags a headline as "High Potential".
//     High-potential headlines are pinned to the top of the creator-facing
//     headline lists and badged, both when browsing manually and when the
//     randomizer surfaces them. Does not affect selection weighting (that stays
//     priority_weight); it's purely a spotlight/label.

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

ALTER TABLE copy_lines
  ADD COLUMN IF NOT EXISTS high_potential BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v25 migration complete.');
    console.log('   • copy_lines.high_potential added (default false)');
    process.exit(0);
  } catch (err) {
    console.error('v25 migration failed:', err);
    process.exit(1);
  }
})();
