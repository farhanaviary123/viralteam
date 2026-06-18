import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import styles from './Guide.module.css';

// Steps:
//   'landing'  → "Ready to make your next video?"
//   1          → pick creative path (from_video | from_text)
//   2          → path-specific learnings (be creative / visuals / which text)
//   3          → editing (tutorial + text learnings + which sound) → Finish
//
// On the very first path pick we create a minimal concept (status
// 'pending_upload'). Finishing opens the Playbook reminder modal; "I've already
// uploaded" flips the concept to 'complete'. Either way we land back on Home.

function Accordion({ icon, title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.accordion}>
      <button type="button" className={styles.accHeader} onClick={() => setOpen(o => !o)}>
        <span className={styles.accTitleWrap}>
          {icon && <span className={styles.accIcon}>{icon}</span>}
          <span className={styles.accTitle}>{title}</span>
        </span>
        <span className={styles.accChevron}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className={styles.accBody}>{children}</div>}
    </div>
  );
}

function NumList({ items = [] }) {
  return (
    <ol className={styles.numList}>
      {items.map((t, i) => (
        <li key={i} className={styles.numItem}>
          <span className={styles.numBadge}>{i + 1}</span>
          <span className={styles.numText}>{t}</span>
        </li>
      ))}
    </ol>
  );
}

function Rule({ emoji, children }) {
  return (
    <div className={styles.ruleRow}>
      <span className={styles.ruleEmoji}>{emoji}</span>
      <span className={styles.ruleText}>{children}</span>
    </div>
  );
}

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

// Renders the ready-to-use copy lines pulled from the DB. Each row is the line
// text + a Copy button. Empty list → nothing rendered (DB has no copy lines yet).
function HeadlineList({ lines = [] }) {
  if (!lines.length) return null;
  return (
    <>
      {lines.map((l) => (
        <div key={l.id} className={styles.headlineRow}>
          <p className={styles.headlineText}>{l.copy_text}</p>
          <CopyChip text={l.copy_text} />
        </div>
      ))}
    </>
  );
}

export default function Guide() {
  const navigate = useNavigate();
  const { id } = useParams(); // present → "review" mode: reopen an existing concept
  const review = !!id;
  const { user } = useAuth();
  const [content, setContent] = useState(null);
  const [copyLines, setCopyLines] = useState([]); // random ready-to-use headlines (Step 2)
  const [songs, setSongs] = useState([]);         // trending sounds (Step 3)
  const [showAllHeadlines, setShowAllHeadlines] = useState(false); // "See all headlines" popup
  const [groupedLines, setGroupedLines] = useState(null);          // angle-grouped lines (lazy-loaded)
  const [groupedErr, setGroupedErr] = useState(null);
  // Review mode skips Step 1 (path already chosen) and opens on Step 2.
  const [step, setStep] = useState(review ? 2 : 1); // 1 | 2 | 3
  const [path, setPath] = useState(null); // 'from_video' | 'from_text'
  const [conceptId, setConceptId] = useState(id || null);
  const [creating, setCreating] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [loadErr, setLoadErr] = useState(null);

  useEffect(() => {
    api.getGuideContent().then(setContent).catch(() => setContent({}));
    // Step 2 headlines + Step 3 sounds are data-driven. Empty DB → empty arrays
    // (the wizard renders the static guidance and simply omits the lists).
    api.getRandomCopyLines(5).then(setCopyLines).catch(() => setCopyLines([]));
    api.getSongs()
      .then(rows => setSongs((rows || []).filter(s => s.status === 'active').slice(0, 5)))
      .catch(() => setSongs([]));
  }, []);

  // Review mode: load the concept to recover which creative path it used.
  useEffect(() => {
    if (!id) return;
    api.getConcept(id)
      .then(c => setPath(c.creative_path || 'from_video'))
      .catch(err => setLoadErr(err.message));
  }, [id]);

  // Picking a path creates the concept (once) and moves to step 2.
  async function pickPath(p) {
    if (creating) return;
    setPath(p);
    setCreating(true);
    try {
      const concept = await api.createConcept({ creative_path: p });
      setConceptId(concept.id);
      setStep(2);
    } catch (err) {
      alert(err.message);
      setPath(null);
    } finally {
      setCreating(false);
    }
  }

  // "See all headlines": open the popup and lazy-load the angle-grouped lines
  // (only the first open hits the network).
  function openAllHeadlines() {
    setShowAllHeadlines(true);
    if (groupedLines === null) {
      api.getCopyLinesGrouped()
        .then(setGroupedLines)
        .catch(err => setGroupedErr(err.message));
    }
  }

  // Both Finish actions mark the concept complete, then show "All done!" and
  // redirect home. "Open Playbook" additionally opens the Playbook link.
  async function completeConcept() {
    if (finishing) return;
    setFinishing(true);
    try {
      if (conceptId) await api.setConceptStatus(conceptId, 'complete');
      setShowFinish(false);
      setAllDone(true);
      setTimeout(() => navigate('/creator'), 1400);
    } catch (err) {
      alert(err.message);
      setFinishing(false);
    }
  }

  // "Open Playbook": open the link in a new tab, then complete + All done.
  function openPlaybookAndComplete() {
    if (user?.playbook_link) window.open(user.playbook_link, '_blank', 'noopener,noreferrer');
    completeConcept();
  }

  if (loadErr) return <div className={styles.page}><p style={{ padding: 24 }}>{loadErr}</p></div>;
  if (!content) return null;
  // Review mode: wait until we know which path the concept used.
  if (review && !path) return null;

  const c = content;
  const stepLabel = `Step ${step} of 3`;

  function backFromStep() {
    // In review mode there's no Step 1 — Step 2 Back returns home.
    if (step === 1 || (review && step === 2)) navigate('/creator');
    else if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={backFromStep}>← Back</button>
        <span className={styles.stepCount}>{stepLabel}</span>
      </div>

      {/* ---- STEP 1: pick path ---- */}
      {step === 1 && (
        <>
          <p className={styles.stepLabel}>STEP 1</p>
          <h2 className={styles.stepTitle}>How creative do you feel today?</h2>
          {/* <p className={styles.stepSub}>Pick the option that feels right. Both will help you make a great video.</p> */}

          <div className={styles.pathGrid}>
            <button className={styles.pathCard} disabled={creating} onClick={() => pickPath('from_video')}>
              <span className={styles.pathIcon}>👁️</span>
              <p className={styles.pathName}>I am feeling creative</p>
              <p className={styles.pathDesc}>→ Start from a viral video</p>
            </button>
            <button className={styles.pathCard} disabled={creating} onClick={() => pickPath('from_text')}>
              <span className={styles.pathIcon}>📄</span>
              <p className={styles.pathName}>Give me direction</p>
              <p className={styles.pathDesc}>→ Start from a proven text</p>
            </button>
          </div>
        </>
      )}

      {/* ---- STEP 2: path-specific learnings ---- */}
      {step === 2 && (
        <>
          <p className={styles.stepLabel}>STEP 2</p>
          <h2 className={styles.stepTitle}>
            {path === 'from_video' ? 'Being creative from a viral video' : 'Being creative from a text'}
          </h2>

          {/* Be creative from X */}
          {(() => {
            const block = path === 'from_video' ? c.from_video : c.from_text;
            if (!block) return null;
            return (
              <Accordion icon="🎯" title={block.title} defaultOpen>
                <NumList items={block.steps || []} />
              </Accordion>
            );
          })()}

          {/* Visuals basic learnings */}
          {c.visuals_learnings && (
            <Accordion icon="✨" title={c.visuals_learnings.title || 'Visuals Basic learnings'}>
              {c.visuals_learnings.charm_timing && (
                <Rule emoji="⏱">
                  <b>Charm timing.</b> {c.visuals_learnings.charm_timing}
                </Rule>
              )}
              {c.visuals_learnings.filming && (
                <Rule emoji="🎥">{c.visuals_learnings.filming}</Rule>
              )}
            </Accordion>
          )}

          {/* Which text to use — Path B: simple intro + ready texts */}
          {path === 'from_text' && c.which_text_b && (
            <Accordion icon="📝" title={c.which_text_b.title || 'Which text to use'}>
              {c.which_text_b.intro && <p className={styles.bodyText}>{c.which_text_b.intro}</p>}
              <HeadlineList lines={copyLines} />
              <button type="button" className={styles.seeAllBtn} onClick={openAllHeadlines}>
                See all headlines
              </button>
            </Accordion>
          )}

          {/* Which text to use — Path A: rich angle/aspirational guidance */}
          {path === 'from_video' && c.which_text && (() => {
            const w = c.which_text;
            return (
              <Accordion icon="📝" title={w.title || 'Which text to use'}>
                {w.core_rule && (
                  <p className={styles.coreRule}>CORE RULE: {w.core_rule}</p>
                )}

                {/* Type 1 — angle headlines */}
                {w.type1 && (
                  <>
                    {w.type1.heading && <p className={styles.subHeading}>{w.type1.heading}</p>}
                    {w.type1.intro && <p className={styles.bodyText}>{w.type1.intro}</p>}
                    {(w.type1.examples || []).map((ex, i) => (
                      <div key={i} className={styles.bulletRow}>
                        <span className={styles.bulletDot}>•</span>
                        <span className={styles.bulletText}>{ex}</span>
                      </div>
                    ))}
                  </>
                )}

                {/* Type 2 — aspirational */}
                {w.type2 && (
                  <>
                    {w.type2.heading && <p className={styles.subHeading}>{w.type2.heading}</p>}
                    {(w.type2.worked || []).map((t, i) => (
                      <div key={`w${i}`} className={styles.bulletRow}>
                        <span className={styles.tagGood}>✅</span>
                        <span className={styles.bulletText}>{t}</span>
                      </div>
                    ))}
                    {(w.type2.didnt || []).map((t, i) => (
                      <div key={`d${i}`} className={styles.bulletRow}>
                        <span className={styles.tagBad}>❌</span>
                        <span className={styles.bulletText}>{t}</span>
                      </div>
                    ))}
                    {w.type2.why && <p className={styles.bodyText}>{w.type2.why}</p>}
                  </>
                )}

                {/* Loom explainer */}
                {w.loom_link && (
                  <a className={styles.linkBtn} href={w.loom_link} target="_blank" rel="noreferrer">
                    {w.loom_label ? `${w.loom_label} →` : 'Watch the explainer →'}
                  </a>
                )}

                {/* How to write a new text */}
                {w.how_to && (
                  <>
                    {w.how_to.heading && <p className={styles.subHeading}>{w.how_to.heading}</p>}
                    {w.how_to.body && <p className={styles.bodyText}>{w.how_to.body}</p>}
                  </>
                )}

                {w.bonus_note && (
                  <p className={styles.bonusNote}>{w.bonus_note}</p>
                )}

                {/* Ready-to-use headlines (pulled from the copy_lines table) */}
                {w.ready_intro && <p className={styles.bodyText}>{w.ready_intro}</p>}
                <HeadlineList lines={copyLines} />
                <button type="button" className={styles.seeAllBtn} onClick={openAllHeadlines}>
                  See all headlines
                </button>
              </Accordion>
            );
          })()}

          <button className={styles.nextBtn} onClick={() => setStep(3)}>
            Next: Start Editing →
          </button>
        </>
      )}

      {/* ---- STEP 3: editing ---- */}
      {step === 3 && (
        <>
          <p className={styles.stepLabel}>STEP 3</p>
          <h2 className={styles.stepTitle}>Editing</h2>
          <p className={styles.stepSub}>Follow these rules when you edit your video.</p>

          {c.editing?.tutorial_url && (
            <a className={styles.tutorialBtn} href={c.editing.tutorial_url} target="_blank" rel="noreferrer">
              ▶ Watch the step-by-step editing tutorial first
            </a>
          )}

          {/* Text basic learnings */}
          {c.editing?.text_learnings && (
            <Accordion icon="🔤" title={c.editing.text_learnings.title || 'Text basic learnings'} defaultOpen>
              {c.editing.text_learnings.font && (
                <Rule emoji="🔤"><b>Font:</b> {c.editing.text_learnings.font}</Rule>
              )}
              {c.editing.text_learnings.position && (
                <Rule emoji="⬆️"><b>Position:</b> {c.editing.text_learnings.position}</Rule>
              )}
              {c.editing.text_learnings.size && (
                <Rule emoji="↔️"><b>Size:</b> {c.editing.text_learnings.size}</Rule>
              )}
              {c.editing.text_learnings.second_text && (
                <Rule emoji="⏱"><b>Second text:</b> {c.editing.text_learnings.second_text}</Rule>
              )}
            </Accordion>
          )}

          {/* Which sound to use — pulled from the songs table */}
          {songs.length > 0 && (
            <Accordion icon="🎵" title="Which sound to use">
              {songs.map((s, i) => (
                <div key={s.id} className={styles.soundRow}>
                  <p className={styles.soundLabel}>{s.name || `Trending sound ${i + 1}`}</p>
                  <div className={styles.soundBtns}>
                    {s.tiktok_link && (
                      <a className={styles.soundBtn} href={s.tiktok_link} target="_blank" rel="noreferrer">▶ TikTok</a>
                    )}
                    {s.link && (
                      <a className={styles.soundBtn} href={s.link} target="_blank" rel="noreferrer">Sound →</a>
                    )}
                  </div>
                </div>
              ))}
            </Accordion>
          )}

          <button className={styles.nextBtn} onClick={() => setShowFinish(true)}>
            Finish
          </button>
        </>
      )}

      {/* ---- "See all headlines" popup: every active headline, by angle ---- */}
      {showAllHeadlines && (
        <div
          className={styles.modalOverlay}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAllHeadlines(false); }}
        >
          <div className={styles.allHeadlinesCard}>
            <div className={styles.allHeadlinesHeader}>
              <h3 className={styles.modalTitle}>All headlines</h3>
              <button
                type="button"
                className={styles.closeX}
                aria-label="Close"
                onClick={() => setShowAllHeadlines(false)}
              >
                ✕
              </button>
            </div>
            <div className={styles.allHeadlinesBody}>
              {groupedErr && <p className={styles.bodyText}>{groupedErr}</p>}
              {!groupedErr && groupedLines === null && (
                <p className={styles.bodyText}>Loading…</p>
              )}
              {!groupedErr && groupedLines !== null && groupedLines.length === 0 && (
                <p className={styles.bodyText}>No headlines yet.</p>
              )}
              {(groupedLines || []).map((g) => (
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
      )}

      {/* ---- Finish / Playbook reminder modal ---- */}
      {showFinish && (
        <div
          className={styles.modalOverlay}
          onClick={(e) => { if (e.target === e.currentTarget) setShowFinish(false); }}
        >
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>Have you uploaded your footage to Playbook?</h3>
            <p className={styles.modalSub}>Don't forget to upload all raw clips and edited videos you just made before moving on!</p>
            <button
              type="button"
              className={styles.modalPrimary}
              disabled={finishing}
              onClick={openPlaybookAndComplete}
            >
              Open Playbook →
            </button>
            <button
              type="button"
              className={styles.modalSecondary}
              disabled={finishing}
              onClick={completeConcept}
            >
              {finishing ? 'Saving…' : "I've already uploaded"}
            </button>
          </div>
        </div>
      )}

      {/* ---- "All done!" confirmation ---- */}
      {allDone && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
            <h3 className={styles.modalTitle}>All done!</h3>
            <p className={styles.modalSub}>Your concept is marked as complete.</p>
          </div>
        </div>
      )}
    </div>
  );
}
