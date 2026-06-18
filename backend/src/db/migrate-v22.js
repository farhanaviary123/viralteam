// v22 migration — Guide wizard data sources.
//
// The creator Guide wizard now pulls real content at random:
//   • Step 2 "Which text to use" → copy_lines (any angle)
//   • Step 3 "Which sound to use" → songs
//
// This DB was set up from the base schema only, so the songs table (added in an
// earlier, never-run migration) is missing, and copy_lines is empty. This
// migration creates songs idempotently, ensures a placeholder angle exists so
// copy_lines (which require an angle_id) can be seeded, and seeds a few of each.

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

CREATE TABLE IF NOT EXISTS songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  link TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','retired')),
  priority_weight INTEGER NOT NULL DEFAULT 3 CHECK (priority_weight BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Columns the songs route expects (added across later migrations).
ALTER TABLE songs ADD COLUMN IF NOT EXISTS tiktok_link TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS all_vibes BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;
`;

const SONGS = [
  { name: 'Trending sound one', link: '' },
  { name: 'Trending sound two', link: '' },
  { name: 'Trending sound three', link: '' },
  { name: 'Trending sound four', link: '' },
];

const COPY = [
  "You've traveled to so many countries → but nobody would know → show it",
  "You're a traveler, not a tourist → show it",
  'Everyone has the same bag → yours is different, it shows all your travels',
  'Go traveling',
  'Show the world where you’ve been',
];

(async () => {
  try {
    await db.query(schema);

    // Seed songs only if empty (link is NOT NULL — use placeholder '#').
    const sCount = (await db.query('SELECT COUNT(*)::int n FROM songs')).rows[0].n;
    if (sCount === 0) {
      for (const s of SONGS) {
        await db.query('INSERT INTO songs (name, link) VALUES ($1,$2)', [s.name, s.link || '#']);
      }
      console.log(`   • seeded ${SONGS.length} songs`);
    } else {
      console.log(`   • songs already present (${sCount}) — left as-is`);
    }

    // copy_lines require an angle_id. Ensure a placeholder angle exists.
    let angle = (await db.query("SELECT id FROM angles WHERE name = 'Guide texts' LIMIT 1")).rows[0];
    if (!angle) {
      angle = (await db.query(
        "INSERT INTO angles (name, description, status) VALUES ('Guide texts', 'Placeholder angle for Guide wizard copy', 'active') RETURNING id"
      )).rows[0];
      console.log('   • created placeholder angle "Guide texts"');
    }

    const cCount = (await db.query('SELECT COUNT(*)::int n FROM copy_lines')).rows[0].n;
    if (cCount === 0) {
      for (const text of COPY) {
        await db.query(
          "INSERT INTO copy_lines (angle_id, copy_text, copy_type, status) VALUES ($1,$2,'single_headline','active')",
          [angle.id, text]
        );
      }
      console.log(`   • seeded ${COPY.length} copy lines`);
    } else {
      console.log(`   • copy_lines already present (${cCount}) — left as-is`);
    }

    console.log('v22 migration complete.');
    process.exit(0);
  } catch (err) {
    console.error('v22 migration failed:', err);
    process.exit(1);
  }
})();
