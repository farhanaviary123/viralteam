import { useState } from 'react';
import styles from '../pages/strategist/Strategist.module.css';

// Ordered multi-select. `picked` is an array of clip ids (in order).
// `clips` is the full clip list to choose from.
export default function ClipPicker({ picked, setPicked, clips, allowDuplicates = false }) {
  const [showDropdown, setShowDropdown] = useState(false);

  const available = allowDuplicates
    ? clips.filter(c => c.status === 'active')
    : clips.filter(c => c.status === 'active' && !picked.includes(c.id));

  function add(id) {
    setPicked([...picked, id]);
    setShowDropdown(false);
  }

  function remove(idx) {
    setPicked(picked.filter((_, i) => i !== idx));
  }

  function move(idx, dir) {
    const next = [...picked];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setPicked(next);
  }

  return (
    <div className={styles.builderBox}>
      {picked.map((id, i) => {
        const clip = clips.find(c => c.id === id);
        if (!clip) return null;
        return (
          <div key={`${id}-${i}`} className={styles.pickedRow}>
            <span className={styles.pickedNum}>{i + 1}</span>
            <span className={styles.pickedName}>{clip.name}</span>
            <button type="button" className={styles.removeBtn} onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
            <button type="button" className={styles.removeBtn} onClick={() => move(i, 1)} disabled={i === picked.length - 1} title="Move down">↓</button>
            <button type="button" className={styles.removeBtn} onClick={() => remove(i)} title="Remove">×</button>
          </div>
        );
      })}

      {!showDropdown ? (
        <button
          type="button"
          className={styles.addBtn}
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setShowDropdown(true)}
        >
          + Add clip
        </button>
      ) : (
        <div className={styles.pickerDropdown}>
          {available.length === 0 && <p className={styles.pickerEmpty}>No more clips available.</p>}
          {available.map(c => (
            <button key={c.id} type="button" className={styles.pickerOption} onClick={() => add(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
