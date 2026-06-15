// v9 migration — add body_eligible flag to clips. Defaults to true so existing
// clips remain pickable for body arrangements.
//
// Hook + body are now independent flags: a clip can be a hook, a body clip,
// both, or just retired (status). The variation builder's clip picker shows
// only body_eligible clips; the hook randomiser still uses is_hook.

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS body_eligible BOOLEAN NOT NULL DEFAULT true;
COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v9 migration complete.');
    console.log('   • added: clips.body_eligible (default true)');
    process.exit(0);
  } catch (err) {
    console.error('v9 migration failed:', err);
    process.exit(1);
  }
})();
