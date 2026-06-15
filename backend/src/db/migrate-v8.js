// v8 migration — restore the format-level arrangement builder on top of the v7
// unified clip library, and simplify the per-clip variation logic.
//
// Drops (v7 artifacts):
//   - concept_shot_list             (replaced by structure-derived shot list)
//   - clips.variation_safe          (per-clip flag superseded by per-arrangement takes)
//   - formats.body_clip_count       (count is implicit in the arrangement)
//
// Restores (v6-style arrangement builder, with new per-item takes count):
//   - clip_structures               (id, format_id, name, position 1-5, status)
//   - clip_structure_items          (clip_structure_id, clip_id, position, takes)
//   - concept_clip_structures       (concept_id PK -> clip_structure_id) — 1:1
//
// Adds:
//   - concepts.hook_clip_id         (the single hook randomly assigned per concept)
//
// All v7 shot-list rows are dropped (test-only data).

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

-- 1. Drop v7 shot list table (replaced by structure-derived list)
DROP TABLE IF EXISTS concept_shot_list;

-- 2. Drop the per-clip variation flag (now per-arrangement-item via "takes")
ALTER TABLE clips DROP COLUMN IF EXISTS variation_safe;

-- 3. Drop body_clip_count (count comes from the picked arrangement)
ALTER TABLE formats DROP COLUMN IF EXISTS body_clip_count;

-- 4. Add hook pointer on concepts (the one hook clip the randomiser picked)
ALTER TABLE concept_projects
  ADD COLUMN IF NOT EXISTS hook_clip_id UUID REFERENCES clips(id) ON DELETE SET NULL;

-- 5. Arrangement (clip structure) tables
CREATE TABLE IF NOT EXISTS clip_structures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  format_id   UUID NOT NULL REFERENCES formats(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','retired')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (format_id, position)
);

CREATE INDEX IF NOT EXISTS idx_clip_structures_format ON clip_structures(format_id);

CREATE TABLE IF NOT EXISTS clip_structure_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_structure_id  UUID NOT NULL REFERENCES clip_structures(id) ON DELETE CASCADE,
  clip_id            UUID NOT NULL REFERENCES clips(id),
  position           INTEGER NOT NULL,
  takes              INTEGER NOT NULL DEFAULT 1 CHECK (takes BETWEEN 1 AND 20),
  UNIQUE (clip_structure_id, position)
);

CREATE INDEX IF NOT EXISTS idx_clip_structure_items_structure
  ON clip_structure_items(clip_structure_id);

-- 6. Concept <-> arrangement (one arrangement per concept)
CREATE TABLE IF NOT EXISTS concept_clip_structures (
  concept_id         UUID PRIMARY KEY REFERENCES concept_projects(id) ON DELETE CASCADE,
  clip_structure_id  UUID NOT NULL REFERENCES clip_structures(id)
);

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v8 migration complete.');
    console.log('   • dropped: concept_shot_list, clips.variation_safe, formats.body_clip_count');
    console.log('   • added:   concept_projects.hook_clip_id');
    console.log('   • created: clip_structures, clip_structure_items (with takes),');
    console.log('              concept_clip_structures (1:1)');
    process.exit(0);
  } catch (err) {
    console.error('v8 migration failed:', err);
    process.exit(1);
  }
})();
