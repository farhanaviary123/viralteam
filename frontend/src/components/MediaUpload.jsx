import { useRef, useState } from 'react';
import { api } from '../api';
import styles from './MediaUpload.module.css';

/**
 * GIF / video / image upload widget.
 *
 * Uploads via POST /api/upload (Supabase Storage). Always also exposes a
 * URL text field for pasting an external link directly.
 *
 * Props:
 *   url       — current url string
 *   setUrl    — setter (fires on every keystroke in the URL field)
 *   label     — optional override
 *   onCommit  — optional. Called with the final URL when the user has
 *               "finalised" a value: after a successful file upload, or when
 *               the URL field blurs / Enter is pressed with a non-empty value.
 *               Used by parents that want to auto-save on commit (e.g. the
 *               example library) without saving on every keystroke.
 *   disabled  — optional. Disables the controls (e.g. while a parent save
 *               is in flight).
 */
export default function MediaUpload({ url, setUrl, label = 'Reference media', onCommit, disabled = false }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.uploadFile(file);
      setUrl(res.url);
      if (onCommit) onCommit(res.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function commitUrlField() {
    const trimmed = (url || '').trim();
    if (trimmed && onCommit) onCommit(trimmed);
  }

  const isImage = url && /\.(gif|png|jpe?g|webp)$/i.test(url);

  return (
    <div className={styles.wrap}>
      <label className={styles.label}>{label}</label>
      {url ? (
        <div className={styles.preview}>
          {isImage
            ? <img src={url} alt="preview" />
            : <span className={styles.fileText}>Linked: {url}</span>}
          <button type="button" className={styles.clearBtn} onClick={() => setUrl('')}>Clear</button>
        </div>
      ) : null}
      <div className={styles.row}>
        <button
          type="button"
          className={styles.uploadBtn}
          onClick={() => fileRef.current?.click()}
          disabled={busy || disabled}
        >
          {busy ? 'Uploading…' : 'Upload GIF / image / video'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/gif,image/png,image/jpeg,image/webp,video/mp4,video/webm"
          onChange={onPick}
          style={{ display: 'none' }}
        />
      </div>
      <input
        type="text"
        className={styles.urlInput}
        placeholder="…or paste a URL"
        value={url || ''}
        onChange={e => setUrl(e.target.value)}
        onBlur={commitUrlField}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitUrlField(); } }}
        disabled={busy || disabled}
      />
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
