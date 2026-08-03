import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/Badge';
import AllHeadlinesModal from '../../components/AllHeadlinesModal';
import styles from './Creator.module.css';
import { HOW_TO_RECORD } from '../../data/howToRecord';

// Simple full-screen modal used by the learning buttons on the home page.
function ContentModal({ title, onClose, children }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg)', borderRadius: 16, width: '100%',
        maxWidth: 430, maxHeight: '85vh', overflow: 'auto', padding: '20px 20px 28px',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px 8px' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Embedded video player (16:9 responsive) for Loom or YouTube.
function VideoEmbed({ url, label }) {
  if (!url) return null;
  const s = String(url);
  const loom = s.match(/loom\.com\/(?:share|embed)\/([a-f0-9]+)/i);
  const yt = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i);
  const embed = loom ? `https://www.loom.com/embed/${loom[1]}` : yt ? `https://www.youtube.com/embed/${yt[1]}` : null;
  if (!embed) {
    return <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--green)', fontWeight: 600, fontSize: 13 }}>{label || 'Watch the video'} →</a>;
  }
  return (
    <div style={{ marginTop: 12 }}>
      {label && <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>{label}</p>}
      <div style={{ position: 'relative', paddingBottom: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
        <iframe
          src={embed}
          title={label || 'Video'}
          frameBorder="0"
          allowFullScreen
          allow="autoplay; fullscreen; picture-in-picture"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}

function Rule({ emoji, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{emoji}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

export default function CreatorHome() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [concepts, setConcepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllHeadlines, setShowAllHeadlines] = useState(false);

  // Guide content for the learning modals
  const [content, setContent] = useState(null);
  const [showVisuals, setShowVisuals] = useState(false);
  const [showText, setShowText] = useState(false);
  const [showMultiText, setShowMultiText] = useState(false);
  const [showAngles, setShowAngles] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);

  useEffect(() => {
    api.getConcepts().then(setConcepts).finally(() => setLoading(false));
    api.getGuideContent().then(setContent).catch(() => setContent({}));
  }, []);

  const inProgress = concepts.filter(c => c.status !== 'done' && c.status !== 'complete');
  const done = concepts.filter(c => c.status === 'done' || c.status === 'complete');

  function conceptTitle(c) {
    if (c.angle_name) return `Concept ${c.sequential_number}: ${c.angle_name}`;
    return c.title || `Concept ${c.sequential_number}`;
  }
  function conceptMeta(c) {
    if (c.format_name) return c.format_name;
    if (c.creative_path === 'from_video') return 'From a viral video';
    if (c.creative_path === 'from_text') return 'From a text';
    return '';
  }

  const c = content || {};

  // Button style generator
  const btnStyle = (bg, border, color) => ({
    display: 'block', width: '100%', boxSizing: 'border-box',
    marginTop: 8, background: bg, border: `1px solid ${border}`,
    color, borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 700, cursor: 'pointer',
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.wordmark}>VIRAL TEAM</p>
        <button className={styles.logoutBtn} onClick={logout}>Sign out</button>
      </header>

      <h1 className={styles.pageTitle}>My Concepts</h1>

      <button className={styles.newBtn} onClick={() => navigate('/creator/new')}>
        + New Concept
      </button>

      <button
        type="button"
        onClick={() => setShowAllHeadlines(true)}
        style={btnStyle('#E7F3EA', 'var(--green)', 'var(--green)')}
      >
        See all headlines
      </button>

      {/* Learning buttons */}
      <button type="button" onClick={() => setShowVisuals(true)}
        style={btnStyle('#EDE9FE', '#7C3AED', '#7C3AED')}>
        Visuals Basic Learnings
      </button>

      <button type="button" onClick={() => setShowText(true)}
        style={btnStyle('#DBEAFE', '#2563EB', '#2563EB')}>
        Text Basic Learnings
      </button>

      <button type="button" onClick={() => setShowAngles(true)}
        style={btnStyle('#FEE2E2', '#DC2626', '#DC2626')}>
        Our Top 3 Angles
      </button>

      <button type="button" onClick={() => setShowChecklist(true)}
        style={{ ...btnStyle('#FFF7ED', '#EA580C', '#EA580C'), marginBottom: 28 }}>
        How to record checklist
      </button>

      {loading ? (
        <p className={styles.empty}>Loading...</p>
      ) : (
        <>
          {inProgress.length > 0 && (
            <section className={styles.section}>
              <p className={styles.sectionLabel}>In Progress</p>
              <div className={styles.list}>
                {inProgress.map(c => (
                  <button key={c.id} className={styles.conceptCard} onClick={() => navigate(`/creator/concept/${c.id}`)}>
                    <div className={`${styles.accent} ${styles.accentOrange}`} />
                    <div className={styles.conceptInfo}>
                      <p className={styles.conceptTitle}>{conceptTitle(c)}</p>
                      <p className={styles.conceptMeta}>{conceptMeta(c)}</p>
                    </div>
                    <div className={styles.conceptRight}>
                      <Badge status={c.status} />
                      <span className={styles.arrow}>→</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {done.length > 0 && (
            <section className={styles.section}>
              <p className={styles.sectionLabel}>Done</p>
              <div className={styles.list}>
                {done.map(c => (
                  <button key={c.id} className={styles.conceptCardDone} onClick={() => navigate(`/creator/concept/${c.id}`)}>
                    <p className={styles.conceptTitleDone}>{conceptTitle(c)}</p>
                    <p className={styles.conceptMetaDone}>{conceptMeta(c)}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {concepts.length === 0 && (
            <p className={styles.empty}>No concepts yet. Tap + New Concept to start.</p>
          )}
        </>
      )}

      <nav className={styles.bottomNav}>
        <button className={`${styles.navItem} ${styles.navActive}`}>Home</button>
        <button className={styles.navItem} disabled style={{ opacity: 0.4, cursor: 'not-allowed' }}>History</button>
      </nav>

      {showAllHeadlines && <AllHeadlinesModal onClose={() => setShowAllHeadlines(false)} />}

      {/* Visuals Basic Learnings modal */}
      {showVisuals && (
        <ContentModal title={c.visuals_learnings?.title || 'Visuals Basic Learnings'} onClose={() => setShowVisuals(false)}>
          {c.visuals_learnings?.charm_timing && (
            <Rule emoji="⏱"><b>Charm timing.</b> {c.visuals_learnings.charm_timing}</Rule>
          )}
          {c.visuals_learnings?.filming && (
            <Rule emoji="🎥">{c.visuals_learnings.filming}</Rule>
          )}
        </ContentModal>
      )}

      {/* Text Basic Learnings modal */}
      {showText && (
        <ContentModal title={c.editing?.text_learnings?.title || 'Text Basic Learnings'} onClose={() => setShowText(false)}>
          {c.editing?.text_learnings?.font && (
            <Rule emoji="🔤"><b>Font:</b> {c.editing.text_learnings.font}</Rule>
          )}
          {c.editing?.text_learnings?.position && (
            <Rule emoji="⬆️"><b>Position:</b> {c.editing.text_learnings.position}</Rule>
          )}
          {c.editing?.text_learnings?.size && (
            <Rule emoji="↔️"><b>Size:</b> {c.editing.text_learnings.size}</Rule>
          )}
          {c.editing?.text_learnings?.second_text && (
            <Rule emoji="⏱"><b>Second text:</b> {c.editing.text_learnings.second_text}</Rule>
          )}
          {c.editing?.multiple_texts?.body && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid #e5e5e5', margin: '14px 0' }} />
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                {c.editing?.multiple_texts?.title || 'Multiple Texts Instructions'}
              </p>
              <Rule emoji="⏱">{c.editing.multiple_texts.body}</Rule>
            </>
          )}
        </ContentModal>
      )}

      {/* Our Top 3 Angles modal */}
      {showAngles && (
        <ContentModal title="Our Top 3 Angles" onClose={() => setShowAngles(false)}>
          {c.which_text && (
            <>
              {c.which_text.core_rule && (
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', background: '#FEF3C7', padding: '10px 12px', borderRadius: 8, marginBottom: 12 }}>
                  CORE RULE: {c.which_text.core_rule}
                </p>
              )}

              {c.which_text.type1 && (
                <>
                  {c.which_text.type1.heading && <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6, marginTop: 12 }}>{c.which_text.type1.heading}</p>}
                  {c.which_text.type1.intro && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>{c.which_text.type1.intro}</p>}
                  {(c.which_text.type1.examples || []).map((ex, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>•</span>
                      <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>{ex}</span>
                    </div>
                  ))}
                </>
              )}

              {c.which_text.type2 && (
                <>
                  {c.which_text.type2.heading && <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6, marginTop: 16 }}>{c.which_text.type2.heading}</p>}
                  {(c.which_text.type2.worked || []).map((t, i) => (
                    <div key={`w${i}`} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                      <span>✅</span>
                      <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>{t}</span>
                    </div>
                  ))}
                  {(c.which_text.type2.didnt || []).map((t, i) => (
                    <div key={`d${i}`} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                      <span>❌</span>
                      <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>{t}</span>
                    </div>
                  ))}
                  {c.which_text.type2.why && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>{c.which_text.type2.why}</p>}
                </>
              )}

              {c.editing?.tutorial_url && (
                <VideoEmbed url={c.editing.tutorial_url} />
              )}

              {c.which_text.how_to && (
                <>
                  {c.which_text.how_to.heading && <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6, marginTop: 16 }}>{c.which_text.how_to.heading}</p>}
                  {c.which_text.how_to.body && <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c.which_text.how_to.body}</p>}
                </>
              )}

              {c.which_text.bonus_note && (
                <p style={{ fontSize: 13, color: 'var(--green-dark)', background: 'var(--green-light)', padding: '10px 12px', borderRadius: 8, marginTop: 12, lineHeight: 1.5 }}>
                  {c.which_text.bonus_note}
                </p>
              )}
            </>
          )}
        </ContentModal>
      )}

      {/* Autorecord Checklist modal */}
      {showChecklist && (
        <ContentModal title="🎬 How to record checklist" onClose={() => setShowChecklist(false)}>
          {c.visuals_learnings?.record_video_url && (
            <VideoEmbed
              url={c.visuals_learnings.record_video_url}
              label={c.visuals_learnings.record_title || 'How to record - Step By Step:'}
            />
          )}
          <div style={{ marginTop: 16 }}>
            {HOW_TO_RECORD.map((b, i) => {
              if (b.kind === 'header') return <h4 key={i} style={{ fontSize: 15, fontWeight: 800, color: '#1F1B14', background: '#FBF3C8', borderRadius: 8, padding: '6px 10px', margin: '22px 0 12px' }}>{b.text}</h4>;
              if (b.kind === 'todo') return <p key={i} style={{ fontSize: 14.5, color: '#1F1B14', lineHeight: 1.55, margin: '0 0 12px' }}>☐ {b.text}</p>;
              if (b.kind === 'note') return <p key={i} style={{ fontSize: 14.5, fontWeight: 600, color: '#1F1B14', lineHeight: 1.55, margin: '0 0 10px' }}>{b.text}</p>;
              if (b.kind === 'text') return <p key={i} style={{ fontSize: 15, fontWeight: 900, letterSpacing: '0.02em', color: '#1F1B14', textAlign: 'center', margin: '16px 0 8px' }}>{b.text}</p>;
              if (b.kind === 'image') return <img key={i} style={{ display: 'block', width: '100%', maxHeight: 420, objectFit: 'contain', borderRadius: 10, background: '#f2efe9', margin: '0 0 8px' }} src={b.file} alt="" loading="lazy" />;
              if (b.kind === 'video') return <video key={i} style={{ display: 'block', width: '100%', maxHeight: 420, objectFit: 'contain', borderRadius: 10, background: '#f2efe9', margin: '0 0 8px' }} src={b.file} controls playsInline muted loop preload="metadata" />;
              return null;
            })}
          </div>
        </ContentModal>
      )}
    </div>
  );
}
