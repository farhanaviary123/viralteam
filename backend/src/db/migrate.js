require('dotenv').config();
const db = require('./index');

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('strategist', 'creator')),
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS angles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'retired')),
  priority_weight INTEGER NOT NULL DEFAULT 3 CHECK (priority_weight BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  reference_video_url TEXT,
  required_copy_type TEXT NOT NULL CHECK (required_copy_type IN ('single_headline', 'multi_headline', 'framework', 'voiceover')),
  shot_list_template TEXT,
  variation_rules TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'retired')),
  priority_weight INTEGER NOT NULL DEFAULT 3 CHECK (priority_weight BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS angle_format_compatibility (
  angle_id UUID NOT NULL REFERENCES angles(id) ON DELETE CASCADE,
  format_id UUID NOT NULL REFERENCES formats(id) ON DELETE CASCADE,
  PRIMARY KEY (angle_id, format_id)
);

CREATE TABLE IF NOT EXISTS copy_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  angle_id UUID NOT NULL REFERENCES angles(id) ON DELETE CASCADE,
  copy_text TEXT NOT NULL,
  copy_type TEXT NOT NULL CHECK (copy_type IN ('single_headline', 'multi_headline', 'framework', 'voiceover')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS concept_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  angle_id UUID NOT NULL REFERENCES angles(id),
  format_id UUID NOT NULL REFERENCES formats(id),
  status TEXT NOT NULL DEFAULT 'needs_shooting' CHECK (status IN ('needs_shooting', 'ready_to_edit', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS concept_copy_lines (
  concept_id UUID NOT NULL REFERENCES concept_projects(id) ON DELETE CASCADE,
  copy_line_id UUID NOT NULL REFERENCES copy_lines(id),
  variation_number INTEGER NOT NULL CHECK (variation_number BETWEEN 1 AND 5),
  PRIMARY KEY (concept_id, variation_number),
  UNIQUE (concept_id, copy_line_id)
);

CREATE TABLE IF NOT EXISTS performance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id UUID NOT NULL REFERENCES concept_projects(id),
  platform TEXT,
  views INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copy_lines_angle ON copy_lines(angle_id);
CREATE INDEX IF NOT EXISTS idx_copy_lines_type_status ON copy_lines(copy_type, status);
CREATE INDEX IF NOT EXISTS idx_concept_projects_creator ON concept_projects(creator_id);
CREATE INDEX IF NOT EXISTS idx_concept_projects_status ON concept_projects(status);
CREATE INDEX IF NOT EXISTS idx_concept_projects_angle ON concept_projects(angle_id);
CREATE INDEX IF NOT EXISTS idx_concept_projects_format ON concept_projects(format_id);
CREATE INDEX IF NOT EXISTS idx_angles_status ON angles(status);
CREATE INDEX IF NOT EXISTS idx_formats_status ON formats(status);
CREATE INDEX IF NOT EXISTS idx_performance_concept ON performance_entries(concept_id);
`;

async function migrate() {
  try {
    await db.query(schema);
    console.log('Migration complete.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
