import { useEffect, useState } from 'react';
import { api } from '../../api';
import StrategistLayout from './StrategistLayout';

// Edits the single guide_content blob that drives the creator Guide wizard.
// Layout: tab bar (Step 1 / 2 / 3) on the left editor column, collapsible
// section cards, drag-reorderable lists, and a live preview of the creator
// wizard on the right.

/* ---------------- styles ---------------- */
const input = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px',
  border: '1px solid #D8D1C4', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit',
};
const textarea = { ...input, minHeight: 60, resize: 'vertical' };
const fieldLabel = { fontSize: 12, fontWeight: 600, color: '#857D70', display: 'block', margin: '12px 0 5px' };
const subHead = { fontSize: 13.5, fontWeight: 700, margin: '22px 0 6px', color: '#1F1B14' };
const smallBtn = {
  border: '1px solid #D8D1C4', background: '#fff', borderRadius: 8,
  padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: '#3A352C',
};
const rowBtn = { ...smallBtn, padding: '4px 9px', color: '#B0392B', borderColor: '#E8C9C4' };

function setPath(obj, path, value) {
  const next = structuredClone(obj);
  let cur = next;
  for (let i = 0; i < path.length - 1; i++) {
    if (cur[path[i]] == null) cur[path[i]] = {};
    cur = cur[path[i]];
  }
  cur[path[path.length - 1]] = value;
  return next;
}

const TABS = [
  { key: 'videos', label: '🎬 Videos' },
  { key: 'step1', label: 'Step 1 — Paths' },
  { key: 'step2', label: 'Step 2 — Learnings & text' },
  { key: 'step3', label: 'Step 3 — Editing' },
];

// The 3 video slots shown in the creator app. One place to manage every embed.
// `path` points at the existing guide-content key so the creator render is
// unchanged — this tab just centralises them.
const VIDEO_SLOTS = [
  {
    path: ['editing', 'tutorial_url'],
    title: 'Step 2 — Headline explanation video',
    help: 'Shows in "Which text to use" (Path A), between the Type 2 headlines and "How to write a new text".',
  },
  {
    path: ['visuals_learnings', 'record_video_url'],
    title: 'Step 2 — How to record video',
    help: 'Shows inside "Visuals basic learnings" (both paths).',
  },
  {
    path: ['editing', 'how_to_edit', 'video_url'],
    title: 'Step 3 — How to Edit Step-by-Step video',
    help: 'Shows in the editing step, above "Text basic learnings".',
  },
];

/* ---- collapsible section card ----
   Hoisted out of GuideContentEditor: defining it inside the component gave it a
   new function identity on every keystroke, so React remounted the whole
   subtree — stealing input focus and scrolling to the top. */
function Section({ id, title, children, defaultOpen = true, open, setOpen }) {
  const isOpen = open[id] === undefined ? defaultOpen : open[id];
  return (
    <div style={{ background: '#fff', border: '1px solid #E6E0D4', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => ({ ...o, [id]: !isOpen }))}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', padding: '16px 18px', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: '#1F1B14' }}>{title}</span>
        <span style={{ color: '#857D70', fontSize: 13 }}>{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && <div style={{ padding: '0 18px 18px', borderTop: '1px solid #F0EBE0' }}>{children}</div>}
    </div>
  );
}

/* ---- drag-reorderable list of plain-string items ----
   Also hoisted (same remount-on-keystroke bug as Section). */
function DragList({ path, label, data, up, drag, setDrag }) {
  const arr = (path.reduce((o, k) => o?.[k], data)) || [];
  const key = path.join('.');
  function move(from, to) {
    if (from === to || to < 0 || to >= arr.length) return;
    const copy = arr.slice();
    const [m] = copy.splice(from, 1);
    copy.splice(to, 0, m);
    up(path, copy);
  }
  return (
    <>
      <label style={fieldLabel}>{label}</label>
      {arr.map((s, i) => {
        const isDragging = drag && drag.key === key && drag.index === i;
        return (
          <div
            key={i}
            draggable
            onDragStart={() => setDrag({ key, index: i })}
            onDragEnd={() => setDrag(null)}
            onDragOver={e => { e.preventDefault(); if (drag && drag.key === key && drag.index !== i) { move(drag.index, i); setDrag({ key, index: i }); } }}
            style={{
              display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start',
              opacity: isDragging ? 0.5 : 1,
            }}
          >
            <span title="Drag to reorder" style={{ cursor: 'grab', color: '#B7AE9E', fontSize: 18, lineHeight: '40px', userSelect: 'none', flex: '0 0 auto' }}>⠿</span>
            <textarea
              style={{ ...textarea, minHeight: 40 }}
              value={s}
              onChange={e => up(path, arr.map((x, j) => j === i ? e.target.value : x))}
            />
            <button style={rowBtn} onClick={() => up(path, arr.filter((_, j) => j !== i))}>✕</button>
          </div>
        );
      })}
      <button style={smallBtn} onClick={() => up(path, [...arr, ''])}>+ Add</button>
    </>
  );
}

export default function GuideContentEditor() {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('videos');
  const [open, setOpen] = useState({}); // collapsed-section state, keyed by section id
  const [previewPath, setPreviewPath] = useState('from_video');
  const [drag, setDrag] = useState(null); // { key, index } during a list drag

  useEffect(() => {
    api.getGuideContent().then(d => setData(d && Object.keys(d).length ? d : seed())).catch(() => setData(seed()));
  }, []);

  function up(path, value) { setData(d => setPath(d, path, value)); }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.updateGuideContent(data);
      setData(saved);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <StrategistLayout><p style={{ padding: 24 }}>Loading…</p></StrategistLayout>;

  const wt = data.which_text || {};
  const wtb = data.which_text_b || {};
  const ed = data.editing || {};
  const tl = ed.text_learnings || {};

  return (
    <StrategistLayout>
      <div style={{ display: 'flex', gap: 24, padding: '24px 28px', alignItems: 'flex-start' }}>
        {/* ---------- editor column ---------- */}
        <div style={{ flex: '1 1 0', minWidth: 0, maxWidth: 720 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Guide Content</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {savedAt && <span style={{ fontSize: 12, color: '#857D70' }}>Saved {savedAt}</span>}
              <button
                style={{ ...smallBtn, background: '#257232', color: '#fff', border: 'none', padding: '10px 20px', fontSize: 14 }}
                disabled={saving}
                onClick={save}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
          {error && <p style={{ color: '#B0392B', fontSize: 13, margin: '4px 0' }}>{error}</p>}
          <p style={{ fontSize: 13, color: '#857D70', marginTop: 0, marginBottom: 18 }}>
            Powers the creator Guide wizard. Changes preview live on the right.
          </p>

          {/* tab bar */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 18, borderBottom: '1px solid #E6E0D4' }}>
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  padding: '10px 12px', fontSize: 13.5, fontWeight: 600,
                  color: tab === t.key ? '#257232' : '#857D70',
                  borderBottom: tab === t.key ? '2px solid #257232' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ===== VIDEOS ===== one input per slot, nothing else ===== */}
          {tab === 'videos' && (
            <>
              <p style={{ fontSize: 13, color: '#857D70', marginTop: 0, marginBottom: 16 }}>
                Paste a YouTube or Loom link for each of the 3 videos. Leave a box empty to hide that video. Click Save changes when done.
              </p>
              {VIDEO_SLOTS.map(slot => {
                const val = slot.path.reduce((o, k) => o?.[k], data) || '';
                return (
                  <div key={slot.path.join('.')} style={{ background: '#fff', border: '1px solid #E6E0D4', borderRadius: 12, marginBottom: 16, padding: '16px 18px' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#1F1B14', margin: '0 0 2px' }}>{slot.title}</p>
                    <p style={{ fontSize: 12, color: '#857D70', margin: '0 0 10px' }}>{slot.help}</p>
                    <input
                      style={input}
                      value={val}
                      placeholder="https://www.youtube.com/watch?v=…  or  https://www.loom.com/share/…"
                      onChange={e => up(slot.path, e.target.value)}
                    />
                  </div>
                );
              })}
            </>
          )}

          {/* ===== STEP 1 ===== */}
          {tab === 'step1' && (
            <>
              <Section id="from_video" title="Path A — From a viral video" open={open} setOpen={setOpen}>
                <label style={fieldLabel}>Section title</label>
                <input style={input} value={data.from_video?.title || ''} onChange={e => up(['from_video', 'title'], e.target.value)} />
                <DragList path={['from_video', 'steps']} label="Steps" data={data} up={up} drag={drag} setDrag={setDrag} />
              </Section>
              <Section id="from_text" title="Path B — From a text" open={open} setOpen={setOpen}>
                <label style={fieldLabel}>Section title</label>
                <input style={input} value={data.from_text?.title || ''} onChange={e => up(['from_text', 'title'], e.target.value)} />
                <DragList path={['from_text', 'steps']} label="Steps" data={data} up={up} drag={drag} setDrag={setDrag} />
              </Section>
            </>
          )}

          {/* ===== STEP 2 ===== */}
          {tab === 'step2' && (
            <>
              <Section id="visuals" title="Visuals basic learnings" open={open} setOpen={setOpen}>
                <label style={fieldLabel}>Section title</label>
                <input style={input} value={data.visuals_learnings?.title || ''} onChange={e => up(['visuals_learnings', 'title'], e.target.value)} />
                <label style={fieldLabel}>Charm timing</label>
                <textarea style={textarea} value={data.visuals_learnings?.charm_timing || ''} onChange={e => up(['visuals_learnings', 'charm_timing'], e.target.value)} />
                <label style={fieldLabel}>Filming</label>
                <textarea style={textarea} value={data.visuals_learnings?.filming || ''} onChange={e => up(['visuals_learnings', 'filming'], e.target.value)} />

                <h3 style={subHead}>How to record (checklist)</h3>
                <p style={{ fontSize: 12, color: '#857D70', margin: '0 0 8px' }}>The video for this section is set in the 🎬 Videos tab.</p>
                <label style={fieldLabel}>Record video title</label>
                <input style={input} value={data.visuals_learnings?.record_title || ''} placeholder="How to record - Step By Step:" onChange={e => up(['visuals_learnings', 'record_title'], e.target.value)} />
                <label style={fieldLabel}>Checklist intro text</label>
                <input style={input} value={data.visuals_learnings?.checklist_intro || ''} placeholder="Check out the How to Record Checklist here:" onChange={e => up(['visuals_learnings', 'checklist_intro'], e.target.value)} />
                <label style={fieldLabel}>Checklist button label</label>
                <input style={input} value={data.visuals_learnings?.checklist_label || ''} placeholder="How to Record Checklist →" onChange={e => up(['visuals_learnings', 'checklist_label'], e.target.value)} />
                <label style={fieldLabel}>Checklist link (Notion, etc.)</label>
                <input style={input} value={data.visuals_learnings?.checklist_url || ''} onChange={e => up(['visuals_learnings', 'checklist_url'], e.target.value)} />
              </Section>

              <Section id="which_text" title="Which text to use — Path A (viral video)" defaultOpen={false} open={open} setOpen={setOpen}>
                <label style={fieldLabel}>Section title</label>
                <input style={input} value={wt.title || ''} onChange={e => up(['which_text', 'title'], e.target.value)} />
                <label style={fieldLabel}>Core rule</label>
                <textarea style={textarea} value={wt.core_rule || ''} onChange={e => up(['which_text', 'core_rule'], e.target.value)} />

                <h3 style={subHead}>Type 1 — Angle headlines</h3>
                <label style={fieldLabel}>Heading</label>
                <input style={input} value={wt.type1?.heading || ''} onChange={e => up(['which_text', 'type1', 'heading'], e.target.value)} />
                <label style={fieldLabel}>Intro</label>
                <textarea style={textarea} value={wt.type1?.intro || ''} onChange={e => up(['which_text', 'type1', 'intro'], e.target.value)} />
                <DragList path={['which_text', 'type1', 'examples']} label="Examples" data={data} up={up} drag={drag} setDrag={setDrag} />

                <h3 style={subHead}>Type 2 — Aspirational headlines</h3>
                <label style={fieldLabel}>Heading</label>
                <input style={input} value={wt.type2?.heading || ''} onChange={e => up(['which_text', 'type2', 'heading'], e.target.value)} />
                <DragList path={['which_text', 'type2', 'worked']} label="What worked ✅" data={data} up={up} drag={drag} setDrag={setDrag} />
                <DragList path={['which_text', 'type2', 'didnt']} label="What didn't ❌" data={data} up={up} drag={drag} setDrag={setDrag} />
                <label style={fieldLabel}>Why (explanation)</label>
                <textarea style={{ ...textarea, minHeight: 120 }} value={wt.type2?.why || ''} onChange={e => up(['which_text', 'type2', 'why'], e.target.value)} />

                <h3 style={subHead}>How to write a new text</h3>
                <label style={fieldLabel}>Heading</label>
                <input style={input} value={wt.how_to?.heading || ''} onChange={e => up(['which_text', 'how_to', 'heading'], e.target.value)} />
                <label style={fieldLabel}>Body</label>
                <textarea style={textarea} value={wt.how_to?.body || ''} onChange={e => up(['which_text', 'how_to', 'body'], e.target.value)} />

                <label style={fieldLabel}>Bonus note</label>
                <textarea style={textarea} value={wt.bonus_note || ''} onChange={e => up(['which_text', 'bonus_note'], e.target.value)} />

                <h3 style={subHead}>Ready-to-use texts</h3>
                <label style={fieldLabel}>Intro</label>
                <textarea style={textarea} value={wt.ready_intro || ''} onChange={e => up(['which_text', 'ready_intro'], e.target.value)} />
                <DragList path={['which_text', 'headlines']} label="Headlines" data={data} up={up} drag={drag} setDrag={setDrag} />
              </Section>

              <Section id="which_text_b" title="Which text to use — Path B (from a text)" defaultOpen={false} open={open} setOpen={setOpen}>
                <label style={fieldLabel}>Section title</label>
                <input style={input} value={wtb.title || ''} onChange={e => up(['which_text_b', 'title'], e.target.value)} />
                <label style={fieldLabel}>Intro</label>
                <textarea style={textarea} value={wtb.intro || ''} onChange={e => up(['which_text_b', 'intro'], e.target.value)} />
                <DragList path={['which_text_b', 'headlines']} label="Headlines" data={data} up={up} drag={drag} setDrag={setDrag} />
              </Section>
            </>
          )}

          {/* ===== STEP 3 ===== */}
          {tab === 'step3' && (
            <>
              <Section id="how_to_edit" title="How to Edit Step-by-Step" open={open} setOpen={setOpen}>
                <p style={{ fontSize: 12, color: '#857D70', margin: '0 0 8px' }}>The video for this section is set in the 🎬 Videos tab.</p>
                <label style={fieldLabel}>Section title</label>
                <input style={input} value={ed.how_to_edit?.title || ''} placeholder="How to Edit Step-by-Step" onChange={e => up(['editing', 'how_to_edit', 'title'], e.target.value)} />
              </Section>
              <Section id="text_learnings" title="Text basic learnings" open={open} setOpen={setOpen}>
                <label style={fieldLabel}>Font</label>
                <input style={input} value={tl.font || ''} onChange={e => up(['editing', 'text_learnings', 'font'], e.target.value)} />
                <label style={fieldLabel}>Position</label>
                <input style={input} value={tl.position || ''} onChange={e => up(['editing', 'text_learnings', 'position'], e.target.value)} />
                <label style={fieldLabel}>Size</label>
                <input style={input} value={tl.size || ''} onChange={e => up(['editing', 'text_learnings', 'size'], e.target.value)} />
                <label style={fieldLabel}>Second text</label>
                <input style={input} value={tl.second_text || ''} onChange={e => up(['editing', 'text_learnings', 'second_text'], e.target.value)} />
              </Section>
              <Section id="multiple_texts" title="Multiple texts instructions" open={open} setOpen={setOpen}>
                <label style={fieldLabel}>Section title</label>
                <input style={input} value={ed.multiple_texts?.title || ''} placeholder="Multiple texts instructions" onChange={e => up(['editing', 'multiple_texts', 'title'], e.target.value)} />
                <label style={fieldLabel}>Body</label>
                <textarea style={textarea} value={ed.multiple_texts?.body || ''} placeholder="If you're using more than one text in your video, switch text every 3.5 seconds…" onChange={e => up(['editing', 'multiple_texts', 'body'], e.target.value)} />
              </Section>
              <Section id="sounds" title="Sounds" open={open} setOpen={setOpen}>
                {(ed.sounds || []).map((s, i) => (
                  <div key={i} style={{ border: '1px solid #EFEADF', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <input
                        style={{ ...input, fontWeight: 600 }}
                        value={s.label || ''}
                        placeholder={`Trending sound ${i + 1}`}
                        onChange={e => up(['editing', 'sounds'], ed.sounds.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      />
                      <button style={{ ...rowBtn, marginLeft: 8 }} onClick={() => up(['editing', 'sounds'], ed.sounds.filter((_, j) => j !== i))}>✕</button>
                    </div>
                    <label style={fieldLabel}>Play URL</label>
                    <input style={input} value={s.play_url || ''} onChange={e => up(['editing', 'sounds'], ed.sounds.map((x, j) => j === i ? { ...x, play_url: e.target.value } : x))} />
                    <label style={fieldLabel}>Download URL</label>
                    <input style={input} value={s.download_url || ''} onChange={e => up(['editing', 'sounds'], ed.sounds.map((x, j) => j === i ? { ...x, download_url: e.target.value } : x))} />
                    <label style={fieldLabel}>Sound link</label>
                    <input style={input} value={s.sound_url || ''} onChange={e => up(['editing', 'sounds'], ed.sounds.map((x, j) => j === i ? { ...x, sound_url: e.target.value } : x))} />
                  </div>
                ))}
                <button style={smallBtn} onClick={() => up(['editing', 'sounds'], [...(ed.sounds || []), { label: '', play_url: '', download_url: '', sound_url: '' }])}>+ Add sound</button>
              </Section>
            </>
          )}
        </div>

        {/* ---------- live preview ---------- */}
        <Preview data={data} tab={tab} previewPath={previewPath} setPreviewPath={setPreviewPath} />
      </div>
    </StrategistLayout>
  );
}

/* ============== live preview (mini creator wizard) ============== */
function Preview({ data, tab, previewPath, setPreviewPath }) {
  const w = previewPath === 'from_video' ? (data.which_text || {}) : (data.which_text_b || {});
  const block = previewPath === 'from_video' ? data.from_video : data.from_text;
  const v = data.visuals_learnings || {};
  const ed = data.editing || {};
  const tl = ed.text_learnings || {};

  const phoneStep = tab === 'step3' ? 3 : tab === 'step1' ? 1 : 2;

  return (
    <div style={{ flex: '0 0 320px', position: 'sticky', top: 24 }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#857D70', margin: '0 0 8px' }}>LIVE PREVIEW</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <PathToggle active={previewPath === 'from_video'} onClick={() => setPreviewPath('from_video')}>Path A</PathToggle>
        <PathToggle active={previewPath === 'from_text'} onClick={() => setPreviewPath('from_text')}>Path B</PathToggle>
      </div>
      <div style={{ background: '#F6F3ED', border: '1px solid #E6E0D4', borderRadius: 18, padding: 16, maxHeight: '78vh', overflowY: 'auto' }}>
        <p style={{ fontSize: 11, color: '#857D70', margin: '0 0 10px' }}>Step {phoneStep} of 3</p>

        {phoneStep === 1 && (
          <PCard title={previewPath === 'from_video' ? 'I am feeling creative' : 'Give me direction'} icon={previewPath === 'from_video' ? '👁️' : '📄'}>
            <Steps items={block?.steps} title={block?.title} />
          </PCard>
        )}

        {phoneStep === 2 && (
          <>
            <PCard title={block?.title || 'How to be creative'} icon="🎯">
              <Steps items={block?.steps} />
            </PCard>
            <PCard title={v.title || 'Visuals Basic learnings'} icon="✨">
              {v.charm_timing && <PRule emoji="⏱">{v.charm_timing}</PRule>}
              {v.filming && <PRule emoji="🎥">{v.filming}</PRule>}
              {v.record_video_url && (
                <div style={{ background: '#257232', color: '#fff', borderRadius: 8, padding: 8, fontSize: 11, fontWeight: 700, textAlign: 'center', marginTop: 8 }}>
                  ▶ {v.record_title || 'How to record - Step By Step:'}
                </div>
              )}
              {v.checklist_url && (
                <>
                  {v.checklist_intro && <PBody>{v.checklist_intro}</PBody>}
                  <div style={{ border: '1px solid #257232', color: '#257232', borderRadius: 8, padding: '6px 8px', fontSize: 11, fontWeight: 600, textAlign: 'center', marginTop: 6 }}>
                    {v.checklist_label || 'How to Record Checklist →'}
                  </div>
                </>
              )}
            </PCard>
            <PCard title={w.title || 'Which text to use'} icon="📝">
              {previewPath === 'from_video' ? (
                <>
                  {w.core_rule && <PCore>CORE RULE: {w.core_rule}</PCore>}
                  {w.type1?.heading && <PSub>{w.type1.heading}</PSub>}
                  {w.type1?.intro && <PBody>{w.type1.intro}</PBody>}
                  {(w.type1?.examples || []).map((e, i) => <PBullet key={i} dot="•">{e}</PBullet>)}
                  {w.type2?.heading && <PSub>{w.type2.heading}</PSub>}
                  {(w.type2?.worked || []).map((e, i) => <PBullet key={`w${i}`} dot="✅">{e}</PBullet>)}
                  {(w.type2?.didnt || []).map((e, i) => <PBullet key={`d${i}`} dot="❌">{e}</PBullet>)}
                  {w.type2?.why && <PBody>{w.type2.why}</PBody>}
                  {w.how_to?.heading && <PSub>{w.how_to.heading}</PSub>}
                  {w.how_to?.body && <PBody>{w.how_to.body}</PBody>}
                  {w.bonus_note && <PBody style={{ fontWeight: 600 }}>{w.bonus_note}</PBody>}
                  {w.ready_intro && <PBody>{w.ready_intro}</PBody>}
                  {(w.headlines || []).map((h, i) => <PHeadline key={i}>{h}</PHeadline>)}
                </>
              ) : (
                <>
                  {w.intro && <PBody>{w.intro}</PBody>}
                  {(w.headlines || []).map((h, i) => <PHeadline key={i}>{h}</PHeadline>)}
                </>
              )}
            </PCard>
          </>
        )}

        {phoneStep === 3 && (
          <>
            {ed.tutorial_url && (
              <div style={{ background: '#257232', color: '#fff', borderRadius: 12, padding: 12, fontSize: 12, fontWeight: 700, textAlign: 'center', marginBottom: 10 }}>
                ▶ Watch the editing tutorial first
              </div>
            )}
            {ed.how_to_edit?.video_url && (
              <PCard title={ed.how_to_edit.title || 'How to Edit Step-by-Step'} icon="🎬">
                <div style={{ background: '#257232', color: '#fff', borderRadius: 8, padding: 8, fontSize: 11, fontWeight: 700, textAlign: 'center', marginTop: 4 }}>
                  ▶ Watch video
                </div>
              </PCard>
            )}
            <PCard title={tl.title || 'Text basic learnings'} icon="🔤">
              {tl.font && <PRule emoji="🔤"><b>Font:</b> {tl.font}</PRule>}
              {tl.position && <PRule emoji="⬆️"><b>Position:</b> {tl.position}</PRule>}
              {tl.size && <PRule emoji="↔️"><b>Size:</b> {tl.size}</PRule>}
              {tl.second_text && <PRule emoji="⏱"><b>Second text:</b> {tl.second_text}</PRule>}
            </PCard>
            {ed.multiple_texts?.body && (
              <PCard title={ed.multiple_texts.title || 'Multiple texts instructions'} icon="⏱">
                <PRule emoji="⏱">{ed.multiple_texts.body}</PRule>
              </PCard>
            )}
            <PCard title="Which sound to use" icon="🎵">
              {(ed.sounds || []).map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: '1px solid #EFEADF', borderRadius: 8, padding: '8px 10px', marginTop: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{s.label || `Trending sound ${i + 1}`}</span>
                  <span style={{ fontSize: 11, color: '#857D70' }}>{[s.play_url && '▶', s.download_url && '↓', s.sound_url && '→'].filter(Boolean).join(' ')}</span>
                </div>
              ))}
            </PCard>
          </>
        )}
      </div>
    </div>
  );
}

/* ---- preview primitives ---- */
function PathToggle({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, border: '1px solid', borderColor: active ? '#257232' : '#D8D1C4',
      background: active ? '#257232' : '#fff', color: active ? '#fff' : '#3A352C',
      borderRadius: 8, padding: '6px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    }}>{children}</button>
  );
}
function PCard({ title, icon, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E6E0D4', borderRadius: 12, padding: 12, marginBottom: 10 }}>
      <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#1F1B14' }}>{icon} {title}</p>
      {children}
    </div>
  );
}
function Steps({ items, title }) {
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(items || []).map((t, i) => (
        <li key={i} style={{ display: 'flex', gap: 8 }}>
          <span style={{ flex: '0 0 auto', width: 18, height: 18, borderRadius: '50%', background: '#E0F2E1', color: '#174D21', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
          <span style={{ fontSize: 12, color: '#3A352C', lineHeight: 1.45 }}>{t}</span>
        </li>
      ))}
    </ol>
  );
}
function PRule({ emoji, children }) {
  return <p style={{ fontSize: 12, color: '#3A352C', lineHeight: 1.45, margin: '8px 0 0' }}>{emoji} {children}</p>;
}
function PSub({ children }) {
  return <p style={{ fontSize: 12.5, fontWeight: 700, color: '#1F1B14', margin: '12px 0 0' }}>{children}</p>;
}
function PBody({ children, style }) {
  return <p style={{ fontSize: 12, color: '#3A352C', lineHeight: 1.5, margin: '6px 0 0', whiteSpace: 'pre-line', ...style }}>{children}</p>;
}
function PBullet({ dot, children }) {
  return (
    <p style={{ fontSize: 12, color: '#3A352C', lineHeight: 1.45, margin: '6px 0 0', display: 'flex', gap: 6 }}>
      <span>{dot}</span><span>{children}</span>
    </p>
  );
}
function PCore({ children }) {
  return <p style={{ background: '#E0F2E1', color: '#174D21', borderRadius: 8, padding: '8px 10px', fontSize: 11.5, fontWeight: 600, margin: '8px 0 0', lineHeight: 1.4 }}>{children}</p>;
}
function PHeadline({ children }) {
  return <p style={{ background: '#FAF8F3', border: '1px solid #EFEADF', borderRadius: 8, padding: '8px 10px', fontSize: 12, margin: '6px 0 0', color: '#1F1B14' }}>{children}</p>;
}

/* ---- fallback structure if API returns nothing ---- */
function seed() {
  return {
    from_video: { title: 'How to be creative from any viral video', steps: [] },
    from_text: { title: 'How to be creative from any text', steps: [] },
    visuals_learnings: {
      title: 'Visuals Basic learnings', charm_timing: '', filming: '',
      record_title: 'How to record - Step By Step:', record_video_url: '',
      checklist_intro: 'Check out the How to Record Checklist here:',
      checklist_label: 'How to Record Checklist →', checklist_url: '',
    },
    which_text: {
      title: 'Which text to use', core_rule: '',
      type1: { heading: 'Type 1 - Angle headlines', intro: '', examples: [] },
      type2: { heading: 'Type 2 - Aspirational headlines', worked: [], didnt: [], why: '' },
      how_to: { heading: 'How to write a new text:', body: '' },
      bonus_note: '', ready_intro: '', headlines: [],
    },
    which_text_b: { title: 'Which text to use', intro: 'Pick any of these texts:', headlines: [] },
    editing: {
      tutorial_url: '',
      how_to_edit: { title: 'How to Edit Step-by-Step', video_url: '' },
      text_learnings: { title: 'Text basic learnings', font: '', position: '', size: '', second_text: '' },
      multiple_texts: { title: 'Multiple texts instructions', body: '' },
      sounds: [],
    },
  };
}
