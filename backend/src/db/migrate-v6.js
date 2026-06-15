require('dotenv').config();
const db = require('./index');

const schema = `
-- ════════════════════════════════════════════════════════════
-- v6 migration: Format media split (thumbnail) + format example
-- library with filterable tags. "Main reference" lives on
-- format_examples.is_main (single source of truth — Option A).
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Format thumbnail ──────────────────────────────────────
ALTER TABLE formats ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Backfill thumbnail from the existing reference_media_url so
-- the format-selection grid keeps working after migration.
UPDATE formats
   SET thumbnail_url = reference_media_url
 WHERE thumbnail_url IS NULL
   AND reference_media_url IS NOT NULL;

-- Note: formats.reference_media_url is retained for backwards
-- compatibility this round; planned drop in v7 once the
-- frontend reads exclusively from format_examples + thumbnail_url.

-- ── 2. Format example library ────────────────────────────────
CREATE TABLE IF NOT EXISTS format_examples (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  format_id     UUID NOT NULL REFERENCES formats(id) ON DELETE CASCADE,
  media_url     TEXT NOT NULL,
  time_of_day   TEXT NOT NULL CHECK (time_of_day IN ('morning','afternoon','evening','night')),
  lighting      TEXT NOT NULL CHECK (lighting    IN ('natural','studio','dark')),
  location      TEXT NOT NULL CHECK (location    IN ('indoor','outdoor','on_the_go')),
  is_main       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary read pattern: list a format's library, newest first.
CREATE INDEX IF NOT EXISTS idx_format_examples_format_created
  ON format_examples (format_id, created_at DESC);

-- Guarantees at most one is_main=true per format. Promotion is
-- a two-step in app code: clear all, then set the new one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_format_examples_one_main
  ON format_examples (format_id) WHERE is_main = true;

-- ── 3. Backfill main example from existing reference_media_url ──
-- For every format that already has a reference video and no
-- example yet, seed one is_main row so the shoot phase keeps
-- showing something. Tag defaults are neutral — strategist can
-- re-tag in the new format builder UI.
INSERT INTO format_examples
  (format_id, media_url, time_of_day, lighting, location, is_main)
SELECT f.id, f.reference_media_url, 'afternoon', 'natural', 'indoor', true
  FROM formats f
 WHERE f.reference_media_url IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM format_examples fe WHERE fe.format_id = f.id
   );

-- ── 4. Concepts: no schema change ────────────────────────────
-- Hard-delete is supported by existing ON DELETE CASCADE on all
-- concept_projects children. Implementation lives in the API.

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('✅ v6 migration complete.');
    console.log('   • formats.thumbnail_url added (backfilled from reference_media_url)');
    console.log('   • format_examples table created with tag CHECKs + (format_id, created_at DESC) index');
    console.log('   • partial unique index on (format_id) WHERE is_main=true');
    console.log('   • backfilled one is_main=true row per format from existing reference_media_url');
    console.log('   • formats.reference_media_url retained (drop planned in v7)');
    process.exit(0);
  } catch (err) {
    console.error('❌ v6 migration failed:', err);
    process.exit(1);
  }
})();
