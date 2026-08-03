import { useEffect, useState } from 'react';
import { api } from '../../api';
import StrategistLayout from './StrategistLayout';

// Edits the home_screen_content blob that powers the creator Home screen
// buttons (e.g. "Our Top 3 Angles"). Separate from Guide Content so
// strategists can manage Home and Guide independently.

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
        <span style={{ color: '#857D70', fontSize: 13 }}>{isOpen ? '\u25B2' : '\u25BC'}</span>
      </button>
      {isOpen && <div style={{ padding: '0 18px 18px', borderTop: '1px solid #F0EBE0' }}>{children}</div>}
    </div>
  );
}

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
            <span title="Drag to reorder" style={{ cursor: 'grab', color: '#B7AE9E', fontSize: 18, lineHeight: '40px', userSelect: 'none', flex: '0 0 auto' }}>{'\u2807'}</span>
            <textarea
              style={{ ...textarea, minHeight: 40 }}
              value={s}
              onChange={e => up(path, arr.map((x, j) => j === i ? e.target.value : x))}
            />
            <button style={rowBtn} onClick={() => up(path, arr.filter((_, j) => j !== i))}>{'\u2715'}</button>
          </div>
        );
      })}
      <button style={smallBtn} onClick={() => up(path, [...arr, ''])}>+ Add</button>
    </>
  );
}

export default function HomeScreenEditor() {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState({});
  const [drag, setDrag] = useState(null);

  useEffect(() => {
    api.getHomeContent().then(d => setData(d && Object.keys(d).length ? d : seed())).catch(() => setData(seed()));
  }, []);

  function up(path, value) { setData(d => setPath(d, path, value)); }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.updateHomeContent(data);
      setData(saved);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <StrategistLayout><p style={{ padding: 24 }}>Loading...</p></StrategistLayout>;

  const angles = data.angles || {};

  return (
    <StrategistLayout>
      <div style={{ padding: '24px 28px', maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Home Screen Content</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {savedAt && <span style={{ fontSize: 12, color: '#857D70' }}>Saved {savedAt}</span>}
            <button
              style={{ ...smallBtn, background: '#257232', color: '#fff', border: 'none', padding: '10px 20px', fontSize: 14 }}
              disabled={saving}
              onClick={save}
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
        {error && <p style={{ color: '#B0392B', fontSize: 13, margin: '4px 0' }}>{error}</p>}
        <p style={{ fontSize: 13, color: '#857D70', marginTop: 0, marginBottom: 18 }}>
          Powers the buttons on the creator Home screen. This is separate from Guide Content.
        </p>

        <Section id="angles" title="Our Top 3 Angles" open={open} setOpen={setOpen}>
          <label style={fieldLabel}>Section title</label>
          <input style={input} value={angles.title || ''} onChange={e => up(['angles', 'title'], e.target.value)} />
          <label style={fieldLabel}>Core rule</label>
          <textarea style={textarea} value={angles.core_rule || ''} onChange={e => up(['angles', 'core_rule'], e.target.value)} />

          <h3 style={subHead}>Type 1 — Angle headlines</h3>
          <label style={fieldLabel}>Heading</label>
          <input style={input} value={angles.type1?.heading || ''} onChange={e => up(['angles', 'type1', 'heading'], e.target.value)} />
          <label style={fieldLabel}>Intro</label>
          <textarea style={textarea} value={angles.type1?.intro || ''} onChange={e => up(['angles', 'type1', 'intro'], e.target.value)} />
          <DragList path={['angles', 'type1', 'examples']} label="Examples" data={data} up={up} drag={drag} setDrag={setDrag} />

          <h3 style={subHead}>Type 2 — Aspirational headlines</h3>
          <label style={fieldLabel}>Heading</label>
          <input style={input} value={angles.type2?.heading || ''} onChange={e => up(['angles', 'type2', 'heading'], e.target.value)} />
          <DragList path={['angles', 'type2', 'worked']} label="What worked" data={data} up={up} drag={drag} setDrag={setDrag} />
          <DragList path={['angles', 'type2', 'didnt']} label="What didn't" data={data} up={up} drag={drag} setDrag={setDrag} />
          <label style={fieldLabel}>Why (explanation)</label>
          <textarea style={{ ...textarea, minHeight: 120 }} value={angles.type2?.why || ''} onChange={e => up(['angles', 'type2', 'why'], e.target.value)} />

          <h3 style={subHead}>How to write a new text</h3>
          <label style={fieldLabel}>Heading</label>
          <input style={input} value={angles.how_to?.heading || ''} onChange={e => up(['angles', 'how_to', 'heading'], e.target.value)} />
          <label style={fieldLabel}>Body</label>
          <textarea style={textarea} value={angles.how_to?.body || ''} onChange={e => up(['angles', 'how_to', 'body'], e.target.value)} />

          <label style={fieldLabel}>Bonus note</label>
          <textarea style={textarea} value={angles.bonus_note || ''} onChange={e => up(['angles', 'bonus_note'], e.target.value)} />

          <label style={fieldLabel}>Tutorial video URL</label>
          <input style={input} value={angles.tutorial_url || ''} placeholder="https://www.youtube.com/watch?v=..." onChange={e => up(['angles', 'tutorial_url'], e.target.value)} />
        </Section>
      </div>
    </StrategistLayout>
  );
}

function seed() {
  return {
    angles: {
      title: 'Our Top 3 Angles', core_rule: '',
      type1: { heading: 'Type 1 - Angle headlines', intro: '', examples: [] },
      type2: { heading: 'Type 2 - Aspirational headlines', worked: [], didnt: [], why: '' },
      how_to: { heading: 'How to write a new text:', body: '' },
      bonus_note: '', tutorial_url: '',
    },
  };
}
