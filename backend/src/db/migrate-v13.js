// v13 migration — drop clip_formats join table.
//
// Clips no longer have a direct format association. Instead, a clip belongs
// to a format iff it appears in any clip_structure_item belonging to a
// clip_structure linked to that format. Hooks (is_hook=true) are now
// universal — any format can use them as the hook.
//
// The backend still surfaces `format_ids` / `format_names` on each clip, but
// these are now DERIVED at read time from clip_structure_items.

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

DROP TABLE IF EXISTS clip_formats;

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v13 migration complete.');
    console.log('   • clip_formats table dropped — format membership now derived from clip_structure_items');
    process.exit(0);
  } catch (err) {
    console.error('v13 migration failed:', err);
    process.exit(1);
  }
})();
