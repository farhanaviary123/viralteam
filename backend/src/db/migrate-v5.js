require('dotenv').config();
const db = require('./index');

const schema = `
-- ════════════════════════════════════════════════════════════
-- v5 migration: Vibes system, preset concepts, inline GIF refs,
-- format-clip rename, format builder restructure
-- ════════════════════════════════════════════════════════════

-- ── 1. Vibes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vibes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO vibes (name) VALUES
  ('Wholesome'),
  ('Upbeat'),
  ('Emotional'),
  ('Aspirational'),
  ('Humorous'),
  ('Educational')
ON CONFLICT (name) DO NOTHING;

-- ── 2. all_vibes flag on every variable parent ───────────────
ALTER TABLE formats         ADD COLUMN IF NOT EXISTS all_vibes BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE angles          ADD COLUMN IF NOT EXISTS all_vibes BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE copy_lines      ADD COLUMN IF NOT EXISTS all_vibes BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE songs           ADD COLUMN IF NOT EXISTS all_vibes BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE clips           ADD COLUMN IF NOT EXISTS all_vibes BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE hooks           ADD COLUMN IF NOT EXISTS all_vibes BOOLEAN NOT NULL DEFAULT false;

-- ── 3. Vibe join tables ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS format_vibes (
  format_id UUID NOT NULL REFERENCES formats(id) ON DELETE CASCADE,
  vibe_id   UUID NOT NULL REFERENCES vibes(id)   ON DELETE CASCADE,
  PRIMARY KEY (format_id, vibe_id)
);

CREATE TABLE IF NOT EXISTS angle_vibes (
  angle_id UUID NOT NULL REFERENCES angles(id) ON DELETE CASCADE,
  vibe_id  UUID NOT NULL REFERENCES vibes(id)  ON DELETE CASCADE,
  PRIMARY KEY (angle_id, vibe_id)
);

CREATE TABLE IF NOT EXISTS copy_line_vibes (
  copy_line_id UUID NOT NULL REFERENCES copy_lines(id) ON DELETE CASCADE,
  vibe_id      UUID NOT NULL REFERENCES vibes(id)      ON DELETE CASCADE,
  PRIMARY KEY (copy_line_id, vibe_id)
);

CREATE TABLE IF NOT EXISTS song_vibes (
  song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  vibe_id UUID NOT NULL REFERENCES vibes(id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, vibe_id)
);

CREATE TABLE IF NOT EXISTS clip_vibes (
  clip_id UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  vibe_id UUID NOT NULL REFERENCES vibes(id) ON DELETE CASCADE,
  PRIMARY KEY (clip_id, vibe_id)
);

CREATE TABLE IF NOT EXISTS hook_vibes (
  hook_id UUID NOT NULL REFERENCES hooks(id) ON DELETE CASCADE,
  vibe_id UUID NOT NULL REFERENCES vibes(id) ON DELETE CASCADE,
  PRIMARY KEY (hook_id, vibe_id)
);

-- ── 4. Rename reference columns to reference_media_url ───────
-- (clips and formats — hooks already use reference_url which stays semantic enough,
--  but we rename it too for full consistency.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='clips' AND column_name='reference_video_url') THEN
    ALTER TABLE clips RENAME COLUMN reference_video_url TO reference_media_url;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='formats' AND column_name='reference_video_url') THEN
    ALTER TABLE formats RENAME COLUMN reference_video_url TO reference_media_url;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='hooks' AND column_name='reference_url') THEN
    ALTER TABLE hooks RENAME COLUMN reference_url TO reference_media_url;
  END IF;
END $$;

-- ── 5. Rename format_shot_list → format_clips ────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name='format_shot_list') THEN
    ALTER TABLE format_shot_list RENAME TO format_clips;
  END IF;
END $$;

-- Rename old index if present, create new name idempotently
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_format_shot_list_format') THEN
    ALTER INDEX idx_format_shot_list_format RENAME TO idx_format_clips_format;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_format_clips_format ON format_clips(format_id);

-- ── 6. Preset concepts ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS preset_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  format_id UUID NOT NULL REFERENCES formats(id) ON DELETE RESTRICT,
  angle_id  UUID NOT NULL REFERENCES angles(id)  ON DELETE RESTRICT,
  priority_weight INTEGER NOT NULL DEFAULT 3 CHECK (priority_weight BETWEEN 1 AND 5),
  all_vibes BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preset_concept_vibes (
  preset_concept_id UUID NOT NULL REFERENCES preset_concepts(id) ON DELETE CASCADE,
  vibe_id           UUID NOT NULL REFERENCES vibes(id)           ON DELETE CASCADE,
  PRIMARY KEY (preset_concept_id, vibe_id)
);

CREATE TABLE IF NOT EXISTS preset_concept_copy_lines (
  preset_concept_id UUID NOT NULL REFERENCES preset_concepts(id) ON DELETE CASCADE,
  copy_line_id      UUID NOT NULL REFERENCES copy_lines(id),
  position          INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5),
  PRIMARY KEY (preset_concept_id, position)
);

CREATE TABLE IF NOT EXISTS preset_concept_songs (
  preset_concept_id UUID NOT NULL REFERENCES preset_concepts(id) ON DELETE CASCADE,
  song_id           UUID NOT NULL REFERENCES songs(id),
  position          INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5),
  PRIMARY KEY (preset_concept_id, position)
);

CREATE TABLE IF NOT EXISTS preset_concept_clip_structures (
  preset_concept_id UUID NOT NULL REFERENCES preset_concepts(id) ON DELETE CASCADE,
  clip_structure_id UUID NOT NULL REFERENCES clip_structures(id),
  position          INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5),
  PRIMARY KEY (preset_concept_id, position)
);

-- Track which preset a concept came from (NULL = randomised)
ALTER TABLE concept_projects
  ADD COLUMN IF NOT EXISTS preset_concept_id UUID NULL REFERENCES preset_concepts(id);

-- ── 7. Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_preset_concepts_format ON preset_concepts(format_id);
CREATE INDEX IF NOT EXISTS idx_preset_concepts_status ON preset_concepts(status);
CREATE INDEX IF NOT EXISTS idx_concept_projects_preset ON concept_projects(preset_concept_id);
`;

(async () => {
  try {
    await db.query(schema);
    console.log('✅ v5 migration complete.');
    console.log('   • vibes table + 6 seed values (Wholesome, Upbeat, Emotional, Aspirational, Humorous, Educational)');
    console.log('   • all_vibes flag added to: formats, angles, copy_lines, songs, clips, hooks');
    console.log('   • 7 vibe join tables (formats / angles / copy_lines / songs / clips / hooks / preset_concepts)');
    console.log('   • renamed reference_video_url / reference_url → reference_media_url on clips, formats, hooks');
    console.log('   • renamed format_shot_list → format_clips (+ index renamed)');
    console.log('   • preset_concepts + 3 ordered child tables (copy_lines, songs, clip_structures)');
    console.log('   • concept_projects.preset_concept_id added');
    process.exit(0);
  } catch (err) {
    console.error('❌ v5 migration failed:', err);
    process.exit(1);
  }
})();
