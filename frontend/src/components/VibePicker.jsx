import { useState } from 'react';
import { api } from '../api';
import styles from './VibePicker.module.css';

/**
 * Reusable Vibes multi-select with "All vibes" wildcard toggle.
 *
 * Props:
 *   vibes         — full list of available vibes ({ id, name })
 *   vibeIds       — currently selected vibe ids
 *   setVibeIds    — setter for vibeIds
 *   allVibes      — boolean wildcard flag
 *   setAllVibes   — setter for allVibes
 *   label         — optional override (default "Vibes")
 *   onVibeCreated — optional callback when a new vibe is created via inline +Add
 */
export default function VibePicker({
  vibes = [],
  vibeIds = [],
  setVibeIds,
  allVibes = false,
  setAllVibes,
  label = 'Vibes',
  onVibeCreated,
  onVibeDeleted,
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  function toggle(id) {
    if (allVibes) return;
    setVibeIds(
      vibeIds.includes(id) ? vibeIds.filter(x => x !== id) : [...vibeIds, id]
    );
  }

  function onAllToggle(e) {
    const checked = e.target.checked;
    setAllVibes(checked);
    if (checked) setVibeIds([]);
  }

  async function createVibe() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setErr(null);
    try {
      const v = await api.createVibe({ name });
      // Auto-select the new vibe
      if (!allVibes) setVibeIds([...vibeIds, v.id]);
      if (onVibeCreated) onVibeCreated(v);
      setNewName('');
      setAdding(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteVibe(v, e) {
    e.stopPropagation();
    if (!window.confirm(`Delete the "${v.name}" vibe? It will be removed from all items that use it.`)) return;
    setDeletingId(v.id);
    try {
      await api.deleteVibe(v.id);
      // Drop from current selection if present
      if (vibeIds.includes(v.id)) setVibeIds(vibeIds.filter(x => x !== v.id));
      if (onVibeDeleted) onVibeDeleted(v.id);
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); createVibe(); }
    else if (e.key === 'Escape') { setAdding(false); setNewName(''); setErr(null); }
  }

  return (
    <div>
      <div className={styles.header}>
        <label className={styles.label}>{label}</label>
        <label className={styles.allToggle}>
          <input type="checkbox" checked={allVibes} onChange={onAllToggle} />
          <span>All vibes (wildcard)</span>
        </label>
      </div>
      <div className={`${styles.grid} ${allVibes ? styles.gridDisabled : ''}`}>
        {vibes.length === 0 && !adding && (
          <p className={styles.empty}>No vibes defined yet.</p>
        )}
        {vibes.map(v => {
          const active = vibeIds.includes(v.id);
          const hover = hoverId === v.id;
          const isDeleting = deletingId === v.id;
          return (
            <span
              key={v.id}
              style={{ position: 'relative', display: 'inline-flex' }}
              onMouseEnter={() => setHoverId(v.id)}
              onMouseLeave={() => setHoverId(prev => prev === v.id ? null : prev)}
            >
              <button
                type="button"
                disabled={allVibes || isDeleting}
                className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                onClick={() => toggle(v.id)}
                style={{ paddingRight: hover ? 22 : undefined, opacity: isDeleting ? 0.5 : 1 }}
              >
                {v.name}
              </button>
              {hover && !allVibes && (
                <button
                  type="button"
                  onClick={(e) => deleteVibe(v, e)}
                  disabled={isDeleting}
                  aria-label={`Delete ${v.name} vibe`}
                  title="Delete vibe"
                  style={{
                    position: 'absolute', top: -6, right: -6,
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#dc2626', color: '#fff',
                    border: '2px solid #fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, lineHeight: 1,
                    cursor: 'pointer', padding: 0,
                  }}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
        {adding ? (
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={onKey}
            onBlur={() => { if (!busy && !newName.trim()) { setAdding(false); setErr(null); } }}
            placeholder="New vibe name…"
            disabled={busy}
            className={styles.chip}
            style={{ minWidth: 140 }}
          />
        ) : (
          <button
            type="button"
            className={styles.chip}
            disabled={allVibes}
            onClick={() => setAdding(true)}
            style={{ borderStyle: 'dashed' }}
          >
            + Add vibe
          </button>
        )}
      </div>
      {err && <p className={styles.empty} style={{ color: '#b91c1c', marginTop: 6 }}>{err}</p>}
    </div>
  );
}
