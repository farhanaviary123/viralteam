import { useEffect, useState } from 'react';
import { api } from '../../api';
import StrategistLayout from './StrategistLayout';
import styles from './Strategist.module.css';

// Inline editor for a single creator link field (playbook_link | drive_link).
// Tracks its own dirty state so unrelated rows aren't re-rendered on each
// keystroke. `field` selects which column it edits.
function LinkCell({ creator, field, onSaved }) {
  const [value, setValue] = useState(creator[field] || '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const dirty = (value || '') !== (creator[field] || '');

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    try {
      const updated = await api.updateCreator(creator.id, {
        [field]: value.trim() || null,
      });
      setSavedAt(Date.now());
      onSaved(updated);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input
        type="url"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
        placeholder="https://..."
        style={{
          flex: 1, minWidth: 220, padding: '6px 8px', fontSize: 13,
          border: '1px solid #ddd', borderRadius: 6,
        }}
      />
      {saving && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Saving…</span>}
      {!saving && savedAt && !dirty && (
        <span style={{ fontSize: 11, color: 'var(--green, #2f9b6e)' }}>✓</span>
      )}
    </div>
  );
}

export default function Creators() {
  const [creators, setCreators] = useState([]);

  useEffect(() => {
    api.getCreators().then(setCreators);
  }, []);

  function onSaved(updated) {
    setCreators(prev => prev.map(c =>
      c.id === updated.id
        ? { ...c, playbook_link: updated.playbook_link, drive_link: updated.drive_link }
        : c
    ));
  }

  return (
    <StrategistLayout>
      <div className={styles.pageHeader}>
        <p className={styles.pageWordmark}>VIRAL TEAM</p>
        <h1 className={styles.pageTitle}>Creators</h1>
      </div>

      <div className={styles.section}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Playbook link</th>
              <th>Drive link</th>
              <th>Concepts Built</th>
              <th>Shot</th>
              <th>Edited</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {creators.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{c.email}</td>
                <td><LinkCell creator={c} field="playbook_link" onSaved={onSaved} /></td>
                <td><LinkCell creator={c} field="drive_link" onSaved={onSaved} /></td>
                <td>{c.concepts_built}</td>
                <td>{c.concepts_shot}</td>
                <td>{c.concepts_edited}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {creators.length === 0 && (
              <tr><td colSpan={8} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>No creators yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </StrategistLayout>
  );
}
