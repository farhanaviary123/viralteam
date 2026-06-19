import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../../api';
import { useAuth } from '../../../context/AuthContext';
import Badge from '../../../components/Badge';
import ReferenceModal from '../../../components/ReferenceModal';
import DeleteConceptButton from '../../../components/DeleteConceptButton';
import styles from '../Creator.module.css';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Could not copy');
    }
  }
  return (
    <button className={styles.vSmallBtn} onClick={copy}>
      {copied ? 'Copied ✓' : 'Copy text'}
    </button>
  );
}

// Inline audio player for Cloudinary-hosted songs.
// Falls back to "Open →" for external links (Spotify/SoundCloud/etc.).
function SongPlayer({ name, url }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const isCloudinary = url && /(^https?:)?\/\/.*res\.cloudinary\.com\//i.test(url);
  const isAudioFile = url && /\.(mp3|wav|m4a|aac|ogg|oga)(\?.*)?$/i.test(url);
  const playable = isCloudinary || isAudioFile;

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  }

  async function download() {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const filename = (name || 'song').replace(/[^a-z0-9-_]+/gi, '_') + '.mp3';
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      // Fallback: open in a new tab so the browser handles it
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  if (!playable) {
    return (
      <button className={styles.vSmallBtn} onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
        Open →
      </button>
    );
  }

  return (
    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <button
        type="button"
        className={styles.vSmallBtn}
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <button
        type="button"
        className={styles.vSmallBtn}
        onClick={download}
        aria-label="Download MP3"
        title="Download MP3"
      >
        ↓
      </button>
      <audio
        ref={audioRef}
        src={url}
        preload="none"
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
    </div>
  );
}

export default function EditPhase() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [concept, setConcept] = useState(null);
  const [doneSet, setDoneSet] = useState(new Set());
  const [advancing, setAdvancing] = useState(false);
  const [refUrl, setRefUrl] = useState(null);

  useEffect(() => {
    api.getConcept(id).then(setConcept);
  }, [id]);

  function toggleDone(v) {
    setDoneSet(prev => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  }

  function openLink(url) {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function markDone() {
    if (advancing) return;
    setAdvancing(true);
    try {
      if (concept.status !== 'done') {
        await api.advanceConceptStatus(id);
      }
      navigate('/creator');
    } catch (err) {
      alert(err.message);
      setAdvancing(false);
    }
  }

  if (!concept) return null;

  const playbookLink = user?.playbook_link || null;
  const titleLabel = concept.sequential_number
    ? `Concept ${concept.sequential_number}: ${concept.angle_name || concept.title}`
    : concept.title;

  return (
    <div className={styles.detailPage}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
        <button className={styles.backLink} onClick={() => navigate('/creator')} style={{ padding: 0 }}>← My Concepts</button>
        <Badge status={concept.status} />
      </div>
      <h1 className={styles.conceptDetailTitle}>{titleLabel}</h1>
      <p className={styles.conceptDetailMeta}>{concept.format_name}</p>
      <p className={styles.editIntro}>Open CapCut and follow each video below.</p>

      {/* Download footage shortcut. Hidden if no Playbook link assigned.
          Note: we can't reuse styles.primaryBtn here — that class is
          position:fixed and pinned to the bottom of the viewport. */}
      {playbookLink && (
        <a
          href={playbookLink}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            padding: 16,
            borderRadius: 'var(--radius-btn)',
            background: 'var(--green)',
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            textAlign: 'center',
            textDecoration: 'none',
            margin: '12px 0 20px',
          }}
        >
          Download footage here
        </a>
      )}

      {concept.variations.map(v => {
        const isDone = doneSet.has(v.variation_number);
        return (
          <div key={v.variation_number} className={`${styles.vCard} ${isDone ? styles.vCardDone : ''}`}>
            <div className={styles.vCardHeader}>
              <p className={styles.vCardTitle}>Video {v.variation_number}</p>
            </div>

            {/* Copy → "Text for video" */}
            {v.copy_line && (
              <div className={styles.vSection}>
                <p className={styles.vSectionLabel}>Text for video</p>
                <p className={styles.vCopyText}>{v.copy_line.copy_text}</p>
                <CopyButton text={v.copy_line.copy_text} />
              </div>
            )}

            {/* Song */}
            {v.song && (
              <div className={styles.vSection}>
                <p className={styles.vSectionLabel}>Song</p>
                <div className={styles.vRow}>
                  <p className={styles.vRowText}>{v.song.name}</p>
                  {v.song.link && (
                    <SongPlayer name={v.song.name} url={v.song.link} />
                  )}
                </div>
                {v.song.tiktok_link && (
                  <button
                    type="button"
                    className={styles.vSmallBtn}
                    style={{ marginTop: 6 }}
                    onClick={() => openLink(v.song.tiktok_link)}
                  >
                    IG/TikTok Link →
                  </button>
                )}
              </div>
            )}

            {/* Hook */}
            {concept.hook && (
              <div className={styles.vSection}>
                <p className={styles.vSectionLabel}>Hook</p>
                <p className={styles.vRowText}>{concept.hook.name}</p>
                {concept.hook.reference_url && (
                  <button className={styles.seeRefLink} onClick={() => setRefUrl(concept.hook.reference_url)}>
                    See reference →
                  </button>
                )}
              </div>
            )}

            {/* Clip order — each variation has its own arrangement (v16).
                Falls back to the shared clip_structure for legacy concepts.
                The hook is prepended as clip #1 so the creator sees the full
                shot sequence in order. */}
            {(() => {
              const baseArr = v.arrangement && v.arrangement.items?.length
                ? v.arrangement
                : (concept.clip_structure?.items?.length
                  ? { name: concept.clip_structure.name, items: concept.clip_structure.items }
                  : null);
              if (!baseArr && !concept.hook) return null;
              const baseItems = baseArr?.items || [];
              const items = concept.hook
                ? [{
                    clip_id: `hook-${concept.hook.id}`,
                    name: concept.hook.name ? `Hook — ${concept.hook.name}` : 'Hook',
                    reference_url: concept.hook.reference_url,
                    _isHook: true,
                  }, ...baseItems]
                : baseItems;
              const arrName = baseArr?.name;
              return (
                <div className={styles.vSection}>
                  <p className={styles.vSectionLabel}>Clip order{arrName ? ` (${arrName})` : ''}</p>
                  <div className={styles.vClipList}>
                    {items.map((c, i) => (
                      <div key={`${c.clip_id || c.id}-${i}`} className={styles.vClipRow}>
                        <span className={styles.vClipNum}>{i + 1}</span>
                        <span className={styles.vClipName}>{c.name}</span>
                        {c.reference_url && (
                          <button className={styles.seeRefLink} onClick={() => setRefUrl(c.reference_url)}>
                            See reference →
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <button
              className={`${styles.vDoneToggle} ${isDone ? styles.vDoneToggleOn : ''}`}
              onClick={() => toggleDone(v.variation_number)}
            >
              {isDone ? '✓ Done' : 'Mark this video done'}
            </button>
          </div>
        );
      })}

      <div style={{ height: 80 }} />

      <button className={styles.primaryBtn} disabled={advancing} onClick={markDone}>
        {advancing ? 'Saving…' : 'Mark as Done'}
      </button>

      <DeleteConceptButton conceptId={id} />

      {refUrl && <ReferenceModal url={refUrl} alt="Clip reference" onClose={() => setRefUrl(null)} />}
    </div>
  );
}
