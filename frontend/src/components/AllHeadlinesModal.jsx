import { useEffect, useState } from 'react';
import { api } from '../api';
import styles from './AllHeadlinesModal.module.css';

// Copy-to-clipboard chip used in each headline row.
function CopyChip({ text }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — ignore */ }
  }
  return (
    <button type="button" className={styles.copyBtn} onClick={copy}>
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  );
}

// Popup listing every active headline grouped by angle. Self-contained: fetches
// the grouped lines on first open. Shared by the creator Guide wizard and the
// Concepts home screen. Render only when open; closes via overlay click or ✕.
export default function AllHeadlinesModal({ onClose }) {
  const [groups, setGroups] = useState(null); // null = loading
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.getCopyLinesGrouped().then(setGroups).catch(e => setErr(e.message));
  }, []);

  return (
    <div
      className={styles.modalOverlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.card}>
        <div className={styles.header}>
          <h3 className={styles.title}>All headlines</h3>
          <button type="button" className={styles.closeX} aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className={styles.body}>
          {err && <p className={styles.bodyText}>{err}</p>}
          {!err && groups === null && <p className={styles.bodyText}>Loading…</p>}
          {!err && groups !== null && groups.length === 0 && (
            <p className={styles.bodyText}>No headlines yet.</p>
          )}
          {(groups || []).map((g) => (
            <div key={g.angle_id} className={styles.angleGroup}>
              <p className={styles.angleName}>{g.angle_name}</p>
              {g.lines.map((l) => (
                <div key={l.id} className={styles.headlineRow}>
                  <p className={styles.headlineText}>{l.copy_text}</p>
                  <CopyChip text={l.copy_text} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
