// Shared helpers for managing vibe joins across every variable parent.
const db = require('../db');

// Replace the full set of vibes on a parent row.
async function setVibes(joinTable, parentCol, parentId, vibeIds = []) {
  await db.query(`DELETE FROM ${joinTable} WHERE ${parentCol} = $1`, [parentId]);
  if (!vibeIds || vibeIds.length === 0) return;
  // Build a multi-row insert
  const values = vibeIds.map((_, i) => `($1, $${i + 2})`).join(',');
  await db.query(
    `INSERT INTO ${joinTable} (${parentCol}, vibe_id) VALUES ${values} ON CONFLICT DO NOTHING`,
    [parentId, ...vibeIds]
  );
}

// Given an array of rows (each having an `id`), attach `vibe_ids: [...]` to each.
async function attachVibes(rows, joinTable, parentCol) {
  if (!rows.length) return rows;
  const ids = rows.map(r => r.id);
  const { rows: joins } = await db.query(
    `SELECT ${parentCol} AS parent_id, vibe_id FROM ${joinTable} WHERE ${parentCol} = ANY($1::uuid[])`,
    [ids]
  );
  const byParent = new Map();
  for (const j of joins) {
    if (!byParent.has(j.parent_id)) byParent.set(j.parent_id, []);
    byParent.get(j.parent_id).push(j.vibe_id);
  }
  return rows.map(r => ({ ...r, vibe_ids: byParent.get(r.id) || [] }));
}

module.exports = { setVibes, attachVibes };
