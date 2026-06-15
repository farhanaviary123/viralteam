import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import styles from './DeleteConceptButton.module.css';

/**
 * Inline delete-concept control with a two-step confirm.
 * Deletes hard. On success, navigates back to /creator.
 */
export default function DeleteConceptButton({ conceptId }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reallyDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await api.deleteConcept(conceptId);
      navigate('/creator');
    } catch (err) {
      alert(err.message);
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button type="button" className={styles.discardBtn} onClick={() => setConfirming(true)}>
        Discard concept
      </button>
    );
  }

  return (
    <div className={styles.confirmRow}>
      <p className={styles.confirmText}>Permanently delete this concept? This cannot be undone.</p>
      <div className={styles.confirmBtns}>
        <button type="button" className={styles.cancelBtn} onClick={() => setConfirming(false)} disabled={busy}>
          Keep
        </button>
        <button type="button" className={styles.deleteBtn} onClick={reallyDelete} disabled={busy}>
          {busy ? 'Deleting…' : 'Delete forever'}
        </button>
      </div>
    </div>
  );
}
