// v19 migration —
//   • users.playbook_link  (per-creator personal Playbook URL)
//   • songs.tiktok_link    (optional TikTok reference URL per song)

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS playbook_link TEXT;

ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS tiktok_link TEXT;

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v19 migration complete.');
    console.log('   • users.playbook_link added');
    console.log('   • songs.tiktok_link added');
    process.exit(0);
  } catch (err) {
    console.error('v19 migration failed:', err);
    process.exit(1);
  }
})();
