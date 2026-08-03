// v27 migration — Home Screen Content.
//
// Adds a separate home_screen_content table so strategists can manage
// Home screen button content (e.g. "Our Top 3 Angles") independently
// of the Guide wizard content.

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

CREATE TABLE IF NOT EXISTS home_screen_content (
  id   INTEGER PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT home_screen_content_singleton CHECK (id = 1)
);

INSERT INTO home_screen_content (id, data)
  VALUES (1, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v27 migration complete.');
    console.log('   home_screen_content table created');
    process.exit(0);
  } catch (err) {
    console.error('v27 migration failed:', err);
    process.exit(1);
  }
})();
