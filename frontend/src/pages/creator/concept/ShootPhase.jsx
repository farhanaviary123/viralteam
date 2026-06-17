import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../../api';
import { useAuth } from '../../../context/AuthContext';
import Badge from '../../../components/Badge';
import DeleteConceptButton from '../../../components/DeleteConceptButton';
import styles from '../Creator.module.css';

function isImageUrl(u) {
  return u && /\.(gif|png|jpe?g|webp|svg)(\?.*)?$/i.test(u);
}

function ClipExamplesModal({ clipName, examples, onClose }) {
  const [fullscreen, setFullscreen] = useState(null);
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, maxWidth: 720, width: '100%',
        maxHeight: '90vh', overflowY: 'auto', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{clipName} — Examples</p>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', lineHeight: 1, color: '#857D70' }}
          >×</button>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 8,
        }}>
          {examples.map(ex => (
            <button
              key={ex.id}
              type="button"
              onClick={() => setFullscreen(ex)}
              style={{
                padding: 0, border: 'none', background: '#000',
                borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                aspectRatio: '9 / 16',
              }}
            >
              {isImageUrl(ex.url)
                ? <img src={ex.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <video src={ex.url} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </button>
          ))}
        </div>
      </div>
      {fullscreen && (
        <div
          onClick={e => { e.stopPropagation(); setFullscreen(null); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
          }}
        >
          {isImageUrl(fullscreen.url)
            ? <img src={fullscreen.url} alt="" style={{ maxWidth: '95%', maxHeight: '95%' }} />
            : <video src={fullscreen.url} controls autoPlay style={{ maxWidth: '95%', maxHeight: '95%' }} />}
        </div>
      )}
    </div>
  );
}

function SeeExamplesButton({ clipId, clipName }) {
  const [examples, setExamples] = useState(null); // null = loading, [] = none
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let on = true;
    api.getClipExamples(clipId)
      .then(rows => { if (on) setExamples(rows); })
      .catch(() => { if (on) setExamples([]); });
    return () => { on = false; };
  }, [clipId]);

  if (!examples || examples.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          alignSelf: 'flex-start',
          background: '#F5F1EA', border: 'none',
          padding: '3px 10px', borderRadius: 999,
          fontSize: 11, fontWeight: 600, color: '#5C5447',
          cursor: 'pointer',
        }}
      >
        See examples ({examples.length})
      </button>
      {open && (
        <ClipExamplesModal
          clipName={clipName}
          examples={examples}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export default function ShootPhase() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [concept, setConcept] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [tickedSet, setTickedSet] = useState(new Set()); // local-only shot-list tick state
  // True while the footage-reminder modal is open (Go to Edit pressed).
  const [pendingProceed, setPendingProceed] = useState(false);

  useEffect(() => {
    api.getConcept(id).then(setConcept);
  }, [id]);

  function toggleTick(clipKey) {
    setTickedSet(prev => {
      const next = new Set(prev);
      if (next.has(clipKey)) next.delete(clipKey);
      else next.add(clipKey);
      return next;
    });
  }

  async function shootAnother() {
    if (advancing) return;
    setAdvancing(true);
    try {
      navigate('/creator/new');
    } finally {
      setAdvancing(false);
    }
  }

  function goToEdit() {
    if (advancing) return;
    // Always show the footage reminder modal — it's a checkpoint, not a guard.
    setPendingProceed(true);
  }

  // Called when the creator dismisses the modal via "I've already uploaded".
  async function confirmAndGoToEdit() {
    setPendingProceed(false);
    setAdvancing(true);
    try {
      if (concept.status === 'needs_shooting') {
        await api.advanceConceptStatus(id);
      }
      navigate(`/creator/concept/${id}/edit`);
    } catch (err) {
      alert(err.message);
      setAdvancing(false);
    }
  }

  if (!concept) return null;

  return (
    <div className={styles.detailPage}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
        <button className={styles.backLink} onClick={() => navigate('/creator')} style={{ padding: 0 }}>← My Concepts</button>
        <Badge status={concept.status} />
      </div>
      <h1 className={styles.conceptDetailTitle}>
        {concept.sequential_number
          ? `Concept ${concept.sequential_number}: ${concept.angle_name || concept.title}`
          : concept.title}
      </h1>
      <p className={styles.conceptDetailMeta}>{concept.format_name}</p>

      <div className={styles.divider} />

      {/* Format reference — inline video */}
      {concept.format_reference_media_url ? (
        <div className={styles.videoEmbed}>
          <video
            src={concept.format_reference_media_url}
            autoPlay
            loop
            muted
            playsInline
            controls
          />
        </div>
      ) : (
        <div className={styles.videoEmbedEmpty}>No reference</div>
      )}

      <button
        className={styles.viewMoreRefsBtn}
        onClick={() => navigate(`/creator/concept/${id}/library`)}
      >
        View more references →
      </button>

      {/* Angle + copy — shown for ALL format types now */}
      <p className={styles.sectionTitle}>Your angle</p>
      <div className={styles.angleCard}>
        <div className={styles.angleCardAccent} />
        <div>
          <p className={styles.angleCardLabel}>Angle</p>
          <p className={styles.angleCardName}>{concept.angle_name}</p>
          {concept.angle_description && (
            <p className={styles.angleCardDesc}>{concept.angle_description}</p>
          )}
        </div>
      </div>

      {(() => {
        const n = concept.variation_count || (concept.variations?.length ?? 5);
        const range = n === 1 ? 'V1' : `V1–V${n}`;
        return (
          <p className={styles.sectionTitle}>Text for video ({range})</p>
        );
      })()}
      {concept.variations.map(v => v.copy_line && (
        <div key={v.variation_number} className={styles.frameworkCard}>
          <p className={styles.frameworkLabel}>Video {v.variation_number}</p>
          <p className={styles.frameworkText}>{v.copy_line.copy_text}</p>
        </div>
      ))}

      <div style={{ height: 12 }} />

      {/* Shot list — Hook (single card with ×5 note) + body clips merged across
          all picked variation arrangements (v16). Each unique body clip shows
          once with computed takes = number of variations sharing its first-two
          slot. */}
      {(() => {
        const hook = concept.hook;
        // body_clips is the merged unique list with pre-computed takes (v16).
        // Falls back to legacy clip_structure.items if backend didn't supply it.
        const rawBody = Array.isArray(concept.body_clips) && concept.body_clips.length
          ? concept.body_clips
          : (concept.clip_structure?.items || []).map(it => ({
              clip_id: it.clip_id,
              name: it.name,
              reference_url: it.reference_url,
              description: it.description,
              is_hook: it.is_hook,
              body_eligible: it.body_eligible,
              takes: it.takes || 1,
            }));

        // Only the single hook clip assigned to this concept appears in the
        // Hook section (×5). If it's also body_eligible we still surface it
        // once in the Body section below.
        const hookEntries = hook ? [{ clip_id: hook.id, entry: hook }] : [];

        const bodyItems = rawBody.slice();
        // If picked hook is also body_eligible and not already in body list,
        // surface it once (takes=1).
        if (hook && hook.body_eligible && !rawBody.some(b => b.clip_id === hook.id)) {
          bodyItems.push({
            clip_id: hook.id,
            name: hook.name,
            reference_url: hook.reference_url,
            description: hook.description,
            takes: 1,
            is_hook: true,
            body_eligible: true,
          });
        }

        if (hookEntries.length === 0 && bodyItems.length === 0) {
          return (
            <>
              <p className={styles.sectionTitle}>Shot list</p>
              <p className={styles.helperSmall}>No shot list yet — strategist needs to add a hook clip and an arrangement to this format.</p>
            </>
          );
        }

        function renderCard(entry, key, label, badge, clipId) {
          const isImage = entry.reference_url && /\.(gif|png|jpe?g|webp|svg)(\?.*)?$/i.test(entry.reference_url);
          const ticked = tickedSet.has(key);
          return (
            <div key={key} className={`${styles.shotCard} ${ticked ? styles.shotCardTicked : ''}`}>
              <button
                type="button"
                className={styles.shotCardThumb}
                onClick={() => toggleTick(key)}
                aria-label={ticked ? `Untick ${entry.name}` : `Tick ${entry.name} as done`}
              >
                {entry.reference_url && (isImage
                  ? <img src={entry.reference_url} alt="" />
                  : <video src={entry.reference_url} autoPlay loop muted playsInline />
                )}
                {badge}
              </button>
              <div className={styles.shotCardBody}>
                <button
                  type="button"
                  className={`${styles.shotTick} ${ticked ? styles.shotTickOn : ''}`}
                  onClick={() => toggleTick(key)}
                  aria-label={ticked ? 'Untick shot' : 'Tick shot as done'}
                >
                  {ticked ? '✓' : ''}
                </button>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <p className={`${styles.shotCardName} ${ticked ? styles.shotNameDimmed : ''}`} style={{ flex: 'unset' }}>
                    {label}
                  </p>
                  {clipId && <SeeExamplesButton clipId={clipId} clipName={entry.name} />}
                </div>
              </div>
            </div>
          );
        }

        return (
          <>
            {hookEntries.length > 0 && (
              <>
                <p className={styles.sectionTitle}>Hook</p>
                <div className={styles.shotGrid}>
                  {hookEntries.map(({ clip_id, entry }) => renderCard(
                    entry,
                    `hook-${clip_id}`,
                    `${entry.name} ×5`,
                    <span style={{
                      position: 'absolute', top: 6, right: 6,
                      background: '#FCD34D', color: '#78350F',
                      fontSize: 11, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 999,
                    }}>★ Hook ×5</span>,
                    clip_id
                  ))}
                </div>
                <p style={{
                  fontSize: 13, color: '#857D70', marginTop: 8, lineHeight: 1.4,
                }}>
                  Note: shoot 5 variations of each hook by slightly changing background or reaction.
                </p>
              </>
            )}

            {hookEntries.length > 0 && bodyItems.length > 0 && (
              <div style={{
                height: 1, background: '#EBE6DD', margin: '24px 0',
              }} />
            )}

            {bodyItems.length > 0 && (
              <>
                <p className={styles.sectionTitle}>Body clips</p>
                <div className={styles.shotGrid}>
                  {bodyItems.map((it, idx) => {
                    const takes = Math.max(1, Number(it.takes) || 1);
                    const entry = { name: it.name, reference_url: it.reference_url };
                    const key = `body-${it.clip_id}`;
                    const label = takes > 1
                      ? `${it.name} — shoot ×${takes} variations`
                      : it.name;
                    return renderCard(
                      entry,
                      key,
                      label,
                      <span className={styles.shotCardNumBadge}>{idx + 1}</span>,
                      it.clip_id
                    );
                  })}
                </div>
              </>
            )}
          </>
        );
      })()}

      <div style={{ height: 32 }} />

      <div className={styles.twoBtnRow}>
        <button className={styles.shootAnotherBtn} disabled={advancing} onClick={shootAnother}>
          Shoot Another
        </button>
        <button className={styles.goToEditBtn} disabled={advancing} onClick={goToEdit}>
          {advancing ? 'Saving…' : 'Go to Edit →'}
        </button>
      </div>

      <DeleteConceptButton conceptId={id} />

      {/* Upload-reminder modal — fires when the creator clicks "Go to Edit"
          without having opened Playbook yet. */}
      {pendingProceed && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setPendingProceed(false); }}
        >
          <div style={{
            background: '#fff', borderRadius: 12, maxWidth: 420, width: '100%',
            padding: 24, boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Have you uploaded your footage to Playbook?</h2>
            <p style={{ color: '#555', fontSize: 14, lineHeight: 1.5 }}>
              Don't forget to upload before moving on.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => {
                  if (user?.playbook_link) {
                    window.open(user.playbook_link, '_blank', 'noopener,noreferrer');
                  } else {
                    alert('No Playbook link assigned yet. Ask your strategist to set one.');
                  }
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: 14,
                  border: 0,
                  borderRadius: 'var(--radius-btn)',
                  background: 'var(--green)',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 600,
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                Open Playbook →
              </button>
              <button
                type="button"
                onClick={confirmAndGoToEdit}
                style={{
                  background: 'none',
                  border: 0,
                  padding: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                I've already uploaded
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
