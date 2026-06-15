// v7 migration — unified clip library (replaces hooks + clips), randomiser-driven shot list.
//
// Drops:
//   - preset_concept_clip_structures
//   - concept_clip_structures
//   - clip_structure_items
//   - clip_structures
//   - format_clips
//   - clip_vibes
//   - hook_vibes
//   - hooks
//   - clips                        (replaced)
//
// Creates:
//   - clips                        (unified: is_hook flag distinguishes hooks)
//   - clip_formats                 (clip <-> format many-to-many)
//   - concept_shot_list            (generated shot list per concept, with multipliers)
//
// All existing clip/hook data is dropped (confirmed test-only).

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

-- 1. Drop dependents first (FKs cascade where possible, but explicit is safer)
DROP TABLE IF EXISTS preset_concept_clip_structures;
DROP TABLE IF EXISTS concept_clip_structures;
DROP TABLE IF EXISTS clip_structure_items;
DROP TABLE IF EXISTS clip_structures;
DROP TABLE IF EXISTS format_clips;
DROP TABLE IF EXISTS clip_vibes;
DROP TABLE IF EXISTS hook_vibes;
DROP TABLE IF EXISTS hooks;
DROP TABLE IF EXISTS clips CASCADE;

-- 2. Unified clips table
CREATE TABLE clips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  reference_url   TEXT,
  is_hook         BOOLEAN NOT NULL DEFAULT false,
  variation_safe  BOOLEAN NOT NULL DEFAULT false,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','retired')),
  weight          INTEGER NOT NULL DEFAULT 3 CHECK (weight BETWEEN 1 AND 5),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clips_is_hook ON clips(is_hook);
CREATE INDEX idx_clips_status  ON clips(status);

-- 3. Clip <-> Format association
CREATE TABLE clip_formats (
  clip_id   UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  format_id UUID NOT NULL REFERENCES formats(id) ON DELETE CASCADE,
  PRIMARY KEY (clip_id, format_id)
);

CREATE INDEX idx_clip_formats_format ON clip_formats(format_id);

-- 4. Concept shot list (one ordered list per concept, no variation_number)
--    is_hook denormalised so list reads don't need a join just to section them.
--    multiplier = 1 means "shoot once", 2 means "Take 1 + Take 2", etc.
CREATE TABLE concept_shot_list (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id  UUID NOT NULL REFERENCES concept_projects(id) ON DELETE CASCADE,
  clip_id     UUID NOT NULL REFERENCES clips(id),
  is_hook     BOOLEAN NOT NULL,
  multiplier  INTEGER NOT NULL DEFAULT 1 CHECK (multiplier BETWEEN 1 AND 5),
  position    INTEGER NOT NULL,
  UNIQUE (concept_id, is_hook, position)
);

CREATE INDEX idx_concept_shot_list_concept ON concept_shot_list(concept_id);

-- 5. Body clip count per format (used by the randomiser to decide how many
--    body clips a concept needs). Defaults to 4. Strategist can edit.
ALTER TABLE formats ADD COLUMN IF NOT EXISTS body_clip_count INTEGER NOT NULL DEFAULT 4
  CHECK (body_clip_count BETWEEN 1 AND 20);

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v7 migration complete.');
    console.log('   • dropped: hooks, clips (old), format_clips, clip_vibes, hook_vibes,');
    console.log('     clip_structures, clip_structure_items, concept_clip_structures,');
    console.log('     preset_concept_clip_structures');
    console.log('   • created: clips (unified, with is_hook + variation_safe + weight),');
    console.log('     clip_formats (M2M), concept_shot_list (with multipliers)');
    process.exit(0);
  } catch (err) {
    console.error('v7 migration failed:', err);
    process.exit(1);
  }
})();
