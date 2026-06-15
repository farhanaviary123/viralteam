// v10 migration —
//   • formats.format_type: drop enum CHECK so it accepts any free-text label
//   • formats.required_copy_type: drop CHECK and convert TEXT → TEXT[] so a
//     format can require single + multiple headlines together.
//
// Existing rows: required_copy_type 'foo' becomes ARRAY['foo'].
//
// copy_lines.copy_type still uses CHECK ('single_headline','multi_headline',
// 'framework','voiceover'); we no longer add new framework/voiceover values
// from the UI but old rows stay valid. We drop that CHECK too so legacy data
// keeps working even if the UI now only emits single/multi.

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

-- formats.format_type: free text
ALTER TABLE formats DROP CONSTRAINT IF EXISTS formats_format_type_check;

-- formats.required_copy_type → TEXT[]
ALTER TABLE formats DROP CONSTRAINT IF EXISTS formats_required_copy_type_check;
ALTER TABLE formats
  ALTER COLUMN required_copy_type DROP NOT NULL;
ALTER TABLE formats
  ALTER COLUMN required_copy_type TYPE TEXT[]
  USING CASE
    WHEN required_copy_type IS NULL THEN ARRAY['single_headline']::text[]
    ELSE ARRAY[required_copy_type]::text[]
  END;
ALTER TABLE formats
  ALTER COLUMN required_copy_type SET DEFAULT ARRAY['single_headline']::text[];
ALTER TABLE formats
  ALTER COLUMN required_copy_type SET NOT NULL;

-- copy_lines.copy_type: relax the CHECK so it accepts the same evolving set
ALTER TABLE copy_lines DROP CONSTRAINT IF EXISTS copy_lines_copy_type_check;

COMMIT;
`;

(async () => {
  try {
    await db.query(schema);
    console.log('v10 migration complete.');
    console.log('   • formats.format_type CHECK dropped (free text)');
    console.log('   • formats.required_copy_type now TEXT[] (multi-select)');
    console.log('   • copy_lines.copy_type CHECK dropped');
    process.exit(0);
  } catch (err) {
    console.error('v10 migration failed:', err);
    process.exit(1);
  }
})();
