// v26 migration —
//   • songs.high_potential BOOLEAN — flags a song as "High Potential".
//     High-potential songs are pinned to the top of the creator-facing
//     sound list and badged, mirroring the behaviour of copy_lines.high_potential.
//   • songs.added_date DATE — records when the song was added. Displayed in
//     the strategist song form; optional field.

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS high_potential BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS added_date DATE;

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v26 migration complete.');
    console.log('   • songs.high_potential added (default false)');
    console.log('   • songs.added_date added (nullable date)');
    process.exit(0);
  } catch (err) {
    console.error('v26 migration failed:', err);
    process.exit(1);
  }
})();
