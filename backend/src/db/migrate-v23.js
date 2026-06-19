// v23 migration —
//   • users.drive_link   (per-creator personal Google Drive upload URL — sits
//                          alongside playbook_link so creators can upload to
//                          whichever they prefer)
//   • songs.platform     ('tiktok' | 'ig') — which platform the song's
//                          IG/TikTok reference link points at, so the creator
//                          UI can redirect correctly. Defaults to 'tiktok' to
//                          preserve existing behaviour.

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS drive_link TEXT;

ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'tiktok';

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v23 migration complete.');
    console.log('   • users.drive_link added');
    console.log('   • songs.platform added (default tiktok)');
    process.exit(0);
  } catch (err) {
    console.error('v23 migration failed:', err);
    process.exit(1);
  }
})();
