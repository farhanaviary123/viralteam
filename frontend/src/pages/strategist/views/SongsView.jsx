import { useEffect, useRef, useState } from 'react';
import { api } from '../../../api';
import VibePicker from '../../../components/VibePicker';
import styles from '../Strategist.module.css';
import mediaStyles from '../../../components/MediaUpload.module.css';

function SongPlayer({ song }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const isAudioFile = (url) => {
    if (!url) return false;
    if (url.includes('res.cloudinary.com')) return true;
    return /\.(mp3|wav|m4a|aac|ogg)(\?|$)/i.test(url);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = song.link;
    a.download = song.name || 'song';
    a.click();
  };

  if (!isAudioFile(song.link)) {
    return (
      <a href={song.link} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 13, color: '#6366f1', textDecoration: 'none' }}>
        Open →
      </a>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <audio ref={audioRef} src={song.link} onEnded={() => setPlaying(false)} />
      <button onClick={togglePlay} style={{
        background: '#6366f1', color: '#fff', border: 'none',
        borderRadius: 20, padding: '4px 12px', cursor: 'pointer', fontSize: 13
      }}>
        {playing ? '⏸ Pause' : '▶ Play'}
      </button>
      <button onClick={handleDownload} style={{
        background: 'transparent', color: '#6366f1', border: '1px solid #6366f1',
        borderRadius: 20, padding: '4px 10px', cursor: 'pointer', fontSize: 13
      }}>
        ↓
      </button>
    </div>
  );
}

function AudioUpload({ url, setUrl }) {
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
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className={mediaStyles.wrap}>
      <label className={mediaStyles.label}>Audio</label>
      {url ? (
        <div className={mediaStyles.preview}>
          <span className={mediaStyles.fileText}>Linked: {url}</span>
          <button type="button" className={mediaStyles.clearBtn} onClick={() => setUrl('')}>Clear</button>
        </div>
      ) : null}
      <div className={mediaStyles.row}>
        <button
          type="button"
          className={mediaStyles.uploadBtn}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {busy ? 'Uploading…' : 'Upload MP3'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/wav,audio/x-m4a,audio/aac,audio/ogg"
          onChange={onPick}
          style={{ display: 'none' }}
        />
      </div>
      <input
        type="text"
        className={mediaStyles.urlInput}
        placeholder="…or paste a URL (Spotify, SoundCloud, Drive)"
        value={url || ''}
        onChange={e => setUrl(e.target.value)}
      />
      {error && <p className={mediaStyles.error}>{error}</p>}
    </div>
  );
}

function DotStatus({ status }) {
  return <span className={`${styles.dot} ${styles['dot' + status.charAt(0).toUpperCase() + status.slice(1)]}`} />;
}

function Modal({ title, onClose, onSave, saving, children }) {
  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <p className={styles.modalTitle}>{title}</p>
        {children}
        <div className={styles.btnRow}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function SongModal({ song, vibes, onClose, onSaved, onDeleted, onVibeCreated, onVibeDeleted }) {
  const [form, setForm] = useState({
    name: song?.name || '',
    link: song?.link || '',
    tiktok_link: song?.tiktok_link || '',
    status: song?.status || 'active',
    priority_weight: song?.priority_weight || 3,
  });
  const [vibeIds, setVibeIds] = useState(song?.vibe_ids || []);
  const [allVibes, setAllVibes] = useState(!!song?.all_vibes);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try {
      const data = {
        ...form,
        tiktok_link: (form.tiktok_link || '').trim() || null,
        priority_weight: Number(form.priority_weight),
        vibe_ids: vibeIds,
        all_vibes: allVibes,
      };
      const saved = song ? await api.updateSong(song.id, data) : await api.createSong(data);
      onSaved(saved);
      onClose();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api.deleteSong(song.id);
      onDeleted(song.id);
      onClose();
    } catch (err) { alert(err.message); setDeleting(false); }
  }

  return (
    <Modal title={song ? 'Edit Song' : 'New Song'} onClose={onClose} onSave={save} saving={saving}>
      <div className={styles.fieldGroup}>
        <div>
          <label className={styles.label}>Name</label>
          <input className={styles.input} value={form.name} onChange={set('name')} placeholder="Song name + artist" />
        </div>
        <div>
          <AudioUpload
            url={form.link}
            setUrl={(u) => setForm(f => ({ ...f, link: u }))}
          />
        </div>
        <div>
          <label className={styles.label}>TikTok link (optional)</label>
          <input
            className={styles.input}
            type="url"
            value={form.tiktok_link}
            onChange={set('tiktok_link')}
            placeholder="https://www.tiktok.com/..."
          />
        </div>
        <div>
          <label className={styles.label}>Status</label>
          <select className={styles.select} value={form.status} onChange={set('status')}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="retired">Retired</option>
          </select>
        </div>
        <div>
          <label className={styles.label}>Priority Weight (1–5)</label>
          <select className={styles.select} value={form.priority_weight} onChange={set('priority_weight')}>
            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <VibePicker
            vibes={vibes}
            vibeIds={vibeIds}
            setVibeIds={setVibeIds}
            allVibes={allVibes}
            setAllVibes={setAllVibes}
            onVibeCreated={onVibeCreated}
            onVibeDeleted={onVibeDeleted}
          />
        </div>

        {song && (
          <div style={{ marginTop: 8 }}>
            {!confirmDel ? (
              <button type="button" className={styles.cancelBtn} onClick={() => setConfirmDel(true)} style={{ color: '#b91c1c' }}>
                Delete song
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#7f1d1d' }}>Delete permanently?</span>
                <button type="button" className={styles.cancelBtn} onClick={() => setConfirmDel(false)}>Cancel</button>
                <button type="button" className={styles.saveBtn} onClick={remove} disabled={deleting} style={{ background: '#dc2626' }}>
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function SongsView() {
  const [songs, setSongs] = useState([]);
  const [vibes, setVibes] = useState([]);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    api.getSongs().then(setSongs);
    api.getVibes().then(setVibes);
  }, []);

  function onSaved(saved) {
    setSongs(prev => {
      const exists = prev.find(s => s.id === saved.id);
      return exists ? prev.map(s => s.id === saved.id ? saved : s) : [...prev, saved];
    });
  }

  function onDeleted(id) {
    setSongs(prev => prev.filter(s => s.id !== id));
  }

  function onVibeCreated(v) {
    setVibes(prev => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)));
  }

  function onVibeDeleted(id) {
    setVibes(prev => prev.filter(v => v.id !== id));
  }

  return (
    <div>
      <div className={styles.listToolbar}>
        <p className={styles.sectionTitle}>Songs ({songs.length})</p>
        <button className={styles.addBtn} onClick={() => setEditing('new')}>+ New Song</button>
      </div>

      <div className={styles.listGrid}>
        {songs.map(s => (
          <button key={s.id} className={styles.itemCard} onClick={() => setEditing(s)}>
            <div className={styles.itemHeader}>
              <DotStatus status={s.status} />
              <p className={styles.itemName}>{s.name}</p>
              <span className={styles.weightBadge}>{s.priority_weight}</span>
            </div>
            <div onClick={e => e.stopPropagation()}>
              <SongPlayer song={s} />
            </div>
          </button>
        ))}
        {songs.length === 0 && <p className={styles.colEmpty}>No songs yet.</p>}
      </div>

      {editing && (
        <SongModal
          song={editing === 'new' ? null : editing}
          vibes={vibes}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
          onDeleted={onDeleted}
          onVibeCreated={onVibeCreated}
          onVibeDeleted={onVibeDeleted}
        />
      )}
    </div>
  );
}
