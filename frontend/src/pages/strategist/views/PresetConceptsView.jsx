import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api';
import VibePicker from '../../../components/VibePicker';
import styles from '../Strategist.module.css';
import presetStyles from './PresetConcepts.module.css';

const STATUS_LABELS = { active: 'Active', paused: 'Paused', retired: 'Retired' };

function DotStatus({ status }) {
  return <span className={`${styles.dot} ${styles['dot' + status.charAt(0).toUpperCase() + status.slice(1)]}`} />;
}

// ── Ordered picker: V1..V5 dropdowns from a candidate pool ──
function OrderedFive({ label, pool, value, onChange, placeholder = '— select —' }) {
  function setAt(i, id) {
    const next = value.slice();
    next[i] = id || null;
    onChange(next);
  }
  const filled = value.filter(Boolean).length;
  return (
    <div className={presetStyles.ordered}>
      <div className={presetStyles.orderedHeader}>
        <span className={styles.label}>{label}</span>
        <span className={`${presetStyles.count} ${filled === 5 ? presetStyles.countOk : presetStyles.countBad}`}>
          {filled}/5
        </span>
      </div>
      {pool.length === 0 && (
        <p className={presetStyles.empty}>No options available — pick an angle/format first.</p>
      )}
      {pool.length > 0 && [0,1,2,3,4].map(i => (
        <div key={i} className={presetStyles.row}>
          <span className={presetStyles.vTag}>V{i + 1}</span>
          <select
            className={styles.select}
            value={value[i] || ''}
            onChange={e => setAt(i, e.target.value)}
          >
            <option value="">{placeholder}</option>
            {pool.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function PresetModal({ preset, formats, angles, vibes, onClose, onSaved, onVibeCreated, onVibeDeleted }) {
  const [form, setForm] = useState({
    name: preset?.name || '',
    format_id: preset?.format_id || '',
    angle_id: preset?.angle_id || '',
    priority_weight: preset?.priority_weight || 3,
    status: preset?.status || 'active',
  });
  const [copyIds, setCopyIds] = useState(
    preset?.copy_line_ids ? [...preset.copy_line_ids, null, null, null, null, null].slice(0, 5) : [null, null, null, null, null]
  );
  const [songIds, setSongIds] = useState(
    preset?.song_ids ? [...preset.song_ids, null, null, null, null, null].slice(0, 5) : [null, null, null, null, null]
  );
  const [vibeIds, setVibeIds] = useState(preset?.vibe_ids || []);
  const [allVibes, setAllVibes] = useState(!!preset?.all_vibes);
  const [copyPool, setCopyPool] = useState([]);
  const [songsPool, setSongsPool] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  // Active songs pool
  useEffect(() => {
    api.getSongs().then(rows => {
      setSongsPool(rows
        .filter(r => r.status === 'active')
        .map(r => ({ id: r.id, label: r.name }))
      );
    });
  }, []);

  // Copy pool — by selected angle (active)
  useEffect(() => {
    if (!form.angle_id) { setCopyPool([]); return; }
    api.getCopyLinesByAngle(form.angle_id).then(rows => {
      setCopyPool(rows
        .filter(r => r.status === 'active')
        .map(r => ({ id: r.id, label: `[${r.copy_type}] ${r.copy_text.slice(0, 60)}` }))
      );
    });
  }, [form.angle_id]);

  // Filter angles to those compatible with selected format
  const compatibleAngles = useMemo(() => {
    if (!form.format_id) return angles;
    const fmt = formats.find(f => f.id === form.format_id);
    if (!fmt) return angles;
    // angles whose compatible_format_ids includes this format
    return angles.filter(a => (a.compatible_format_ids || []).includes(form.format_id));
  }, [form.format_id, formats, angles]);

  // When format changes, if angle is no longer compatible, clear it (and dependent pools)
  useEffect(() => {
    if (form.angle_id && !compatibleAngles.find(a => a.id === form.angle_id)) {
      setForm(f => ({ ...f, angle_id: '' }));
      setCopyIds([null, null, null, null, null]);
    }
  }, [form.format_id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setError(null);
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.format_id) { setError('Format is required'); return; }
    if (!form.angle_id) { setError('Angle is required'); return; }
    if (copyIds.filter(Boolean).length !== 5) { setError('Pick exactly 5 copy lines (V1–V5)'); return; }
    if (songIds.filter(Boolean).length !== 5) { setError('Pick exactly 5 songs (V1–V5)'); return; }

    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        format_id: form.format_id,
        angle_id: form.angle_id,
        priority_weight: Number(form.priority_weight),
        status: form.status,
        copy_line_ids: copyIds,
        song_ids: songIds,
        vibe_ids: vibeIds,
        all_vibes: allVibes,
      };
      const saved = preset
        ? await api.updatePresetConcept(preset.id, body)
        : await api.createPresetConcept(body);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`${styles.modal} ${styles.modalWide}`}>
        <p className={styles.modalTitle}>{preset ? 'Edit Preset Concept' : 'New Preset Concept'}</p>

        <div className={styles.fieldGroup}>
          <div>
            <label className={styles.label}>Name</label>
            <input className={styles.input} value={form.name} onChange={set('name')} placeholder="Internal label (e.g. 'Charm gift drop Q2')" />
          </div>
          <div className={presetStyles.gridTwo}>
            <div>
              <label className={styles.label}>Format</label>
              <select className={styles.select} value={form.format_id} onChange={set('format_id')}>
                <option value="">— select —</option>
                {formats.filter(f => f.status === 'active').map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={styles.label}>Angle (compatible with format)</label>
              <select className={styles.select} value={form.angle_id} onChange={set('angle_id')} disabled={!form.format_id}>
                <option value="">— select —</option>
                {compatibleAngles.filter(a => a.status === 'active').map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <OrderedFive
            label="Copy Lines (V1–V5)"
            pool={copyPool}
            value={copyIds}
            onChange={setCopyIds}
          />
          <OrderedFive
            label="Songs (V1–V5)"
            pool={songsPool}
            value={songIds}
            onChange={setSongIds}
          />
          <OrderedFive
            label="Clip Structures (V1–V5)"
            pool={structurePool}
            value={structureIds}
            onChange={setStructureIds}
          />

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

          <div className={presetStyles.gridTwo}>
            <div>
              <label className={styles.label}>Priority Weight (1–5)</label>
              <select className={styles.select} value={form.priority_weight} onChange={set('priority_weight')}>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className={styles.label}>Status</label>
              <select className={styles.select} value={form.status} onChange={set('status')}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="retired">Retired</option>
              </select>
            </div>
          </div>
        </div>

        {error && <p className={presetStyles.error}>{error}</p>}

        <div className={styles.btnRow}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PresetConceptsView() {
  const [presets, setPresets] = useState([]);
  const [formats, setFormats] = useState([]);
  const [angles, setAngles] = useState([]);
  const [vibes, setVibes] = useState([]);
  const [editing, setEditing] = useState(null); // 'new' | preset row

  useEffect(() => {
    api.getPresetConcepts().then(setPresets);
    api.getFormats().then(setFormats);
    api.getAngles().then(setAngles);
    api.getVibes().then(setVibes);
  }, []);

  function onSaved(saved) {
    setPresets(prev => {
      const exists = prev.find(p => p.id === saved.id);
      return exists ? prev.map(p => p.id === saved.id ? saved : p) : [...prev, saved];
    });
  }

  const vibeNameById = useMemo(() => {
    const m = new Map();
    for (const v of vibes) m.set(v.id, v.name);
    return m;
  }, [vibes]);

  async function openEdit(p) {
    try {
      const full = await api.getPresetConcept(p.id);
      setEditing(full);
    } catch {
      setEditing(p);
    }
  }

  return (
    <div>
      <div className={styles.listToolbar}>
        <p className={styles.sectionTitle}>Preset Concepts ({presets.length})</p>
        <button className={styles.addBtn} onClick={() => setEditing('new')}>+ New Preset Concept</button>
      </div>

      <div className={presetStyles.cardGrid}>
        {presets.length === 0 && <p className={styles.colEmpty}>No preset concepts yet.</p>}
        {presets.map(p => (
          <button key={p.id} className={presetStyles.card} onClick={() => openEdit(p)}>
            <div className={presetStyles.cardHeader}>
              <DotStatus status={p.status} />
              <p className={presetStyles.cardName}>{p.name}</p>
              <span className={styles.weightBadge}>{p.priority_weight}</span>
            </div>
            <div className={presetStyles.cardMeta}>
              <span className={presetStyles.metaPill}>{p.format_name}</span>
              <span className={presetStyles.metaPill}>{p.angle_name}</span>
            </div>
            {(p.all_vibes || (p.vibe_ids && p.vibe_ids.length > 0)) && (
              <div className={presetStyles.vibeRow}>
                {p.all_vibes
                  ? <span className={presetStyles.vibeChip}>All vibes</span>
                  : p.vibe_ids.map(vid => (
                      <span key={vid} className={presetStyles.vibeChip}>{vibeNameById.get(vid) || '—'}</span>
                    ))}
              </div>
            )}
            <span className={presetStyles.statusBadge}>{STATUS_LABELS[p.status] || p.status}</span>
          </button>
        ))}
      </div>

      {editing && (
        <PresetModal
          preset={editing === 'new' ? null : editing}
          formats={formats}
          angles={angles}
          vibes={vibes}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
          onVibeCreated={(v) => setVibes(prev => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)))}
          onVibeDeleted={(id) => setVibes(prev => prev.filter(v => v.id !== id))}
        />
      )}
    </div>
  );
}
