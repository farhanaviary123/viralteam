// v21 migration — Guide wizard concept flow.
//
// The creator concept-creation flow is replaced by a 3-step Guide wizard that
// picks a "creative path" (from a viral video, or from a text we give them)
// instead of a format/angle/variations. Concepts created this way carry no
// angle/format, and use two new statuses driven by the Playbook upload step.
//
//   • concept_projects.angle_id / format_id → nullable (minimal concepts have
//     neither). Existing rich concepts keep their values.
//   • status CHECK relaxed to add 'pending_upload' and 'complete'.
//   • concept_projects.creative_path added ('from_video' | 'from_text').
//   • guide_content single-row table holds all the static guide copy/links the
//     wizard renders, so the strategist can edit it. Seeded with defaults.

require('dotenv').config();
const db = require('./index');

const schema = `
BEGIN;

-- Minimal concepts have no angle/format.
ALTER TABLE concept_projects ALTER COLUMN angle_id DROP NOT NULL;
ALTER TABLE concept_projects ALTER COLUMN format_id DROP NOT NULL;

-- Add the Playbook-driven statuses. Drop the old CHECK first (name is the
-- Postgres default: <table>_<column>_check).
ALTER TABLE concept_projects DROP CONSTRAINT IF EXISTS concept_projects_status_check;
ALTER TABLE concept_projects
  ADD CONSTRAINT concept_projects_status_check
  CHECK (status IN ('needs_shooting', 'ready_to_edit', 'done', 'pending_upload', 'complete'));

ALTER TABLE concept_projects
  ADD COLUMN IF NOT EXISTS creative_path TEXT
    CHECK (creative_path IS NULL OR creative_path IN ('from_video', 'from_text'));

-- Single-row guide content table. id is pinned to a constant so there's always
-- exactly one row to read/update.
CREATE TABLE IF NOT EXISTS guide_content (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
`;

// Default content lifted from the spec screenshots. headlines/learnings are
// arrays so the strategist editor can add/remove rows.
const DEFAULT_CONTENT = {
  from_video: {
    title: 'How to be creative from any viral video',
    steps: [
      'Scroll on TikTok or Instagram until you find a video that instantly makes you think: "This would look great with the charms!"',
      'Then ask yourself: "How can I make the same video but showing the charms in it?"',
      'Write down all your ideas on a notebook or your phone\'s notes, then go record!',
    ],
  },
  from_text: {
    title: 'How to be creative from any text',
    steps: [
      'Read the texts below and ask yourself: "Which clips can I record to match what the text is saying?"',
      'Example: if the text is about passport stamps, you could start your video showing yourself holding your passport open with all passport stamps visible',
      'If by reading the text nothing comes to mind, search key words from the text on TikTok (e.g. "passport stamps") to get ideas',
      'Write down all your ideas on a notebook or your phone\'s notes, then go record!',
    ],
  },
  visuals_learnings: {
    title: 'Visuals Basic learnings',
    charm_timing: 'Show the charms no earlier than second 2 and no later than second 3. You can introduce the charms 1 second earlier than what just said but they should not be clearly visible until the second 2 mark.',
    filming: 'Film all your clips in the same place, with the same lighting.',
  },
  which_text: {
    title: 'Which text to use',
    core_rule: 'the text needs to give the viewer a clear reason to buy the charms.',
    type1: {
      heading: 'Type 1 - Angle headlines',
      intro: 'The texts that converted the most were all about "showing your travels", always giving a reason to buy:',
      examples: [
        'You\'ve traveled to so many countries → but nobody would know → show it',
        'You\'re a traveler, not a tourist → show it',
        'Everyone has the same bag → yours is different, it shows all your travels',
      ],
    },
    type2: {
      heading: 'Type 2 - Aspirational headlines',
      worked: ['Go traveling'],
      didnt: ["What's your biggest dream?", "What's your goal in life?", 'My definition of a rich life'],
      why: 'Why? The texts that didn\'t work didn\'t give a clear reason to buy the charms. For example, the charms aren\'t the reason traveling is "my definition of a rich life", that\'s just a statement. While the charms can be reason why "you\'re a traveler, not a tourist", because they show you\'ve traveled to way more countries than a tourist would.\n\n"Go traveling" is an exception, it\'s already worked 3 times on ads and resonates with our audience enough to drive purchases, even though it\'s still just a statement.',
    },
    loom_label: 'Watch our founder, Tristan, explain why our best texts win',
    loom_link: '',
    how_to: {
      heading: 'How to write a new text:',
      body: 'Look at the original text of the video you\'re replicating and ask: "Can I twist this to include the charms?" If yes, and it follows what just explained, giving a clear reason to buy, then it\'s great. If not, come up with your own, making sure there\'s a clear reason to buy.',
    },
    bonus_note: "You'll get a $50 bonus for every good text you come up with yourself that we think have potential to do well on ads!",
    ready_intro: "Not sure where to start? Here's a list of ready-to-use texts we came up with for you:",
    headlines: [
      'Headline 1',
      'Headline 2',
      'Headline 3',
      'Headline 4',
      'Headline 5',
    ],
  },
  // Path B uses a simpler "Which text to use" block: just an intro + a small
  // list of ready texts (no Type 1/2 / how-to). Path A uses which_text above.
  which_text_b: {
    title: 'Which text to use',
    intro: 'Pick any of these texts:',
    headlines: [
      'Headline 1',
      'Headline 2',
      'Headline 3',
    ],
  },
  editing: {
    tutorial_url: '',
    text_learnings: {
      title: 'Text basic learnings',
      font: 'Use the font named "Classic" on CapCut and TikTok',
      position: 'Place the text in the middle-top of the screen, more towards the middle.',
      size: 'As big as possible while still looking aesthetic.',
      second_text: 'If you are using a second text, it must appear no later than second 3.5',
    },
    sounds: [
      { label: 'Trending sound one', play_url: '', download_url: '', sound_url: '' },
      { label: 'Trending sound two', play_url: '', download_url: '', sound_url: '' },
      { label: 'Trending sound three', play_url: '', download_url: '', sound_url: '' },
    ],
  },
};

(async () => {
  try {
    await db.query(schema);
    await db.query(
      `INSERT INTO guide_content (id, data) VALUES (1, $1)
         ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(DEFAULT_CONTENT)]
    );
    console.log('v21 migration complete.');
    console.log('   • concept_projects.angle_id / format_id now nullable');
    console.log('   • status CHECK extended: pending_upload, complete');
    console.log('   • concept_projects.creative_path added');
    console.log('   • guide_content table created + seeded');
    process.exit(0);
  } catch (err) {
    console.error('v21 migration failed:', err);
    process.exit(1);
  }
})();
