require('dotenv').config();
const db = require('./index');

// Idempotency marker — checked before seeding
const MARKER_ANGLE = 'Charm story-first';

// Every seeded variable is tagged with this vibe so the v5 generator
// finds at least one valid combination end-to-end.
const SEED_VIBE = 'Wholesome';

const SEED = {
  clips: [
    {
      name: 'Charm close-up',
      description: 'Extreme close-up of a single charm — slow rotation, soft natural light.',
      reference_media_url: 'https://media.giphy.com/media/26gsspfBC42AeRgha/giphy.gif',
    },
    {
      name: 'Bag clip-on moment',
      description: 'POV of clipping the charm onto a handbag strap. Hands only, daylight.',
      reference_media_url: 'https://media.giphy.com/media/3o6Zt6KHxJTbXCnSvu/giphy.gif',
    },
  ],

  format: {
    name: 'Charm POV — Talking Head',
    description: 'Selfie-style talking head with quick B-roll cutaways of the charm being attached.',
    reference_media_url: 'https://media.giphy.com/media/26gsspfBC42AeRgha/giphy.gif',
    required_copy_type: 'single_headline',
    format_type: 'talking_head',
    priority_weight: 4,
  },

  angle: {
    name: MARKER_ANGLE,
    description: 'Lead with the meaning behind the charm — what it represents to the wearer — then reveal the product.',
    priority_weight: 5,
  },

  copy_lines: [
    { copy_text: 'The charm I wear every single day.', copy_type: 'single_headline', priority_weight: 5 },
    { copy_text: "I didn't think a £25 charm would change my whole bag.", copy_type: 'single_headline', priority_weight: 4 },
  ],

  clip_structures: [
    { name: 'Structure A — charm first', priority_weight: 5, order: [0, 1] },
    { name: 'Structure B — bag first',   priority_weight: 3, order: [1, 0] },
  ],

  songs: [
    { name: 'Lofi Daydream — Aiko',  link: 'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh', priority_weight: 4 },
    { name: 'Slow Motion — Charlotte Day Wilson', link: 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp', priority_weight: 3 },
  ],

  hooks: [
    {
      name: 'Extreme close-up on charm',
      description: 'Open with a tight macro shot of the charm catching the light.',
      reference_media_url: 'https://media.giphy.com/media/26gsspfBC42AeRgha/giphy.gif',
    },
    {
      name: 'Bag transformation',
      description: 'Before/after — same bag, with vs without the charm clipped on.',
      reference_media_url: 'https://media.giphy.com/media/3o6Zt6KHxJTbXCnSvu/giphy.gif',
    },
  ],
};

(async () => {
  try {
    // Idempotency check
    const exists = await db.query('SELECT 1 FROM angles WHERE name = $1 LIMIT 1', [MARKER_ANGLE]);
    if (exists.rows.length) {
      console.log(`Seed marker "${MARKER_ANGLE}" already exists — skipping. Drop the row to re-seed.`);
      process.exit(0);
    }

    // Resolve seed vibe id (must already exist from v5 migration)
    const vibeRes = await db.query('SELECT id FROM vibes WHERE name=$1', [SEED_VIBE]);
    if (!vibeRes.rows.length) {
      console.error(`❌ Seed vibe "${SEED_VIBE}" not found. Run migrate:v5 first.`);
      process.exit(1);
    }
    const vibeId = vibeRes.rows[0].id;

    await db.query('BEGIN');

    // 1. Clips
    const clipIds = [];
    for (const c of SEED.clips) {
      const { rows } = await db.query(
        `INSERT INTO clips (name, description, reference_media_url) VALUES ($1,$2,$3) RETURNING id`,
        [c.name, c.description, c.reference_media_url]
      );
      clipIds.push(rows[0].id);
      await db.query(`INSERT INTO clip_vibes (clip_id, vibe_id) VALUES ($1,$2)`, [rows[0].id, vibeId]);
    }

    // 2. Format
    const fmt = (await db.query(
      `INSERT INTO formats (name, description, reference_media_url, required_copy_type, format_type, priority_weight)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [SEED.format.name, SEED.format.description, SEED.format.reference_media_url,
       SEED.format.required_copy_type, SEED.format.format_type, SEED.format.priority_weight]
    )).rows[0];
    await db.query(`INSERT INTO format_vibes (format_id, vibe_id) VALUES ($1,$2)`, [fmt.id, vibeId]);

    // Relational shot list (ordered)
    for (let i = 0; i < clipIds.length; i++) {
      await db.query(
        `INSERT INTO format_clips (format_id, clip_id, position) VALUES ($1,$2,$3)`,
        [fmt.id, clipIds[i], i + 1]
      );
    }

    // 3. Angle
    const angle = (await db.query(
      `INSERT INTO angles (name, description, priority_weight) VALUES ($1,$2,$3) RETURNING id`,
      [SEED.angle.name, SEED.angle.description, SEED.angle.priority_weight]
    )).rows[0];
    await db.query(`INSERT INTO angle_vibes (angle_id, vibe_id) VALUES ($1,$2)`, [angle.id, vibeId]);

    // Compatibility
    await db.query(
      `INSERT INTO angle_format_compatibility (angle_id, format_id) VALUES ($1,$2)`,
      [angle.id, fmt.id]
    );

    // 4. Copy lines
    for (const cl of SEED.copy_lines) {
      const ins = await db.query(
        `INSERT INTO copy_lines (angle_id, copy_text, copy_type, priority_weight) VALUES ($1,$2,$3,$4) RETURNING id`,
        [angle.id, cl.copy_text, cl.copy_type, cl.priority_weight]
      );
      await db.query(`INSERT INTO copy_line_vibes (copy_line_id, vibe_id) VALUES ($1,$2)`, [ins.rows[0].id, vibeId]);
    }

    // 5. Clip structures
    for (const cs of SEED.clip_structures) {
      const struct = (await db.query(
        `INSERT INTO clip_structures (name, format_id, priority_weight) VALUES ($1,$2,$3) RETURNING id`,
        [cs.name, fmt.id, cs.priority_weight]
      )).rows[0];
      for (let i = 0; i < cs.order.length; i++) {
        const clipIdx = cs.order[i];
        await db.query(
          `INSERT INTO clip_structure_items (clip_structure_id, clip_id, position) VALUES ($1,$2,$3)`,
          [struct.id, clipIds[clipIdx], i + 1]
        );
      }
    }

    // 6. Songs
    for (const s of SEED.songs) {
      const ins = await db.query(
        `INSERT INTO songs (name, link, priority_weight) VALUES ($1,$2,$3) RETURNING id`,
        [s.name, s.link, s.priority_weight]
      );
      await db.query(`INSERT INTO song_vibes (song_id, vibe_id) VALUES ($1,$2)`, [ins.rows[0].id, vibeId]);
    }

    // 7. Hooks
    for (const h of SEED.hooks) {
      const ins = await db.query(
        `INSERT INTO hooks (name, description, reference_media_url) VALUES ($1,$2,$3) RETURNING id`,
        [h.name, h.description, h.reference_media_url]
      );
      await db.query(`INSERT INTO hook_vibes (hook_id, vibe_id) VALUES ($1,$2)`, [ins.rows[0].id, vibeId]);
    }

    await db.query('COMMIT');
    console.log('✅ v4/v5 seed complete.');
    console.log(`   • 2 clips (+ ${SEED_VIBE})`);
    console.log(`   • 1 format (talking_head): "${SEED.format.name}" (+ ${SEED_VIBE})`);
    console.log(`   • 1 angle: "${SEED.angle.name}" (+ ${SEED_VIBE})`);
    console.log(`   • 2 copy lines (single_headline, + ${SEED_VIBE})`);
    console.log(`   • 2 clip structures`);
    console.log(`   • 2 songs (+ ${SEED_VIBE})`);
    console.log(`   • 2 hooks (+ ${SEED_VIBE})`);
    process.exit(0);
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
})();
