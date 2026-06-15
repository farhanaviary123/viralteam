require('dotenv').config();
const db = require('./index');

const schema = `
-- ── Modify existing tables ──────────────────────────────
ALTER TABLE formats ADD COLUMN IF NOT EXISTS format_type TEXT
  CHECK (format_type IN ('talking_head', 'text_overlay', 'voiceover', 'ugc_story'));
ALTER TABLE formats DROP COLUMN IF EXISTS shot_list_template;
ALTER TABLE formats DROP COLUMN IF EXISTS variation_rules;

ALTER TABLE copy_lines ADD COLUMN IF NOT EXISTS priority_weight INTEGER NOT NULL DEFAULT 3
  CHECK (priority_weight BETWEEN 1 AND 5);

ALTER TABLE concept_projects ADD COLUMN IF NOT EXISTS footage_link TEXT;

-- v4 allows copy-line repeats across variations; drop v1's unique constraint
ALTER TABLE concept_copy_lines DROP CONSTRAINT IF EXISTS concept_copy_lines_concept_id_copy_line_id_key;

-- ── New tables ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  reference_video_url TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS format_shot_list (
  format_id UUID NOT NULL REFERENCES formats(id) ON DELETE CASCADE,
  clip_id   UUID NOT NULL REFERENCES clips(id),
  position  INTEGER NOT NULL,
  PRIMARY KEY (format_id, position),
  UNIQUE (format_id, clip_id)
);

CREATE TABLE IF NOT EXISTS clip_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  format_id UUID NOT NULL REFERENCES formats(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','retired')),
  priority_weight INTEGER NOT NULL DEFAULT 3 CHECK (priority_weight BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clip_structure_items (
  clip_structure_id UUID NOT NULL REFERENCES clip_structures(id) ON DELETE CASCADE,
  clip_id           UUID NOT NULL REFERENCES clips(id),
  position          INTEGER NOT NULL,
  PRIMARY KEY (clip_structure_id, position)
);

CREATE TABLE IF NOT EXISTS songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  link TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','retired')),
  priority_weight INTEGER NOT NULL DEFAULT 3 CHECK (priority_weight BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  reference_url TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS concept_songs (
  concept_id        UUID NOT NULL REFERENCES concept_projects(id) ON DELETE CASCADE,
  song_id           UUID NOT NULL REFERENCES songs(id),
  variation_number  INTEGER NOT NULL CHECK (variation_number BETWEEN 1 AND 5),
  PRIMARY KEY (concept_id, variation_number)
);

CREATE TABLE IF NOT EXISTS concept_clip_structures (
  concept_id        UUID NOT NULL REFERENCES concept_projects(id) ON DELETE CASCADE,
  clip_structure_id UUID NOT NULL REFERENCES clip_structures(id),
  variation_number  INTEGER NOT NULL CHECK (variation_number BETWEEN 1 AND 5),
  PRIMARY KEY (concept_id, variation_number)
);

CREATE INDEX IF NOT EXISTS idx_clips_status ON clips(status);
CREATE INDEX IF NOT EXISTS idx_songs_status ON songs(status);
CREATE INDEX IF NOT EXISTS idx_hooks_status ON hooks(status);
CREATE INDEX IF NOT EXISTS idx_clip_structures_format ON clip_structures(format_id);
CREATE INDEX IF NOT EXISTS idx_clip_structures_status ON clip_structures(status);
CREATE INDEX IF NOT EXISTS idx_format_shot_list_format ON format_shot_list(format_id);
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v4 migration complete.');
    process.exit(0);
  } catch (err) {
    console.error('v4 migration failed:', err);
    process.exit(1);
  }
})();
