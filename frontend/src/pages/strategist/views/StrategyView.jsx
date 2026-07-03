import { useEffect, useState } from 'react';
import { api } from '../../../api';
import VibePicker from '../../../components/VibePicker';
import FormatBuilderModal from '../../../components/FormatBuilderModal';
import styles from '../Strategist.module.css';

// Display-only labels for legacy values; new copy lines only emit
// single_headline / multi_headline. format_type is now free text.
const COPY_TYPE_LABELS = { single_headline: 'Single Headline', multi_headline: 'Multiple Headline', framework: 'Framework', voiceover: 'Voiceover' };
const FORMAT_TYPE_LABELS = { talking_head: 'Talking Head', text_overlay: 'Text Overlay', voiceover: 'Voiceover', ugc_story: 'UGC Story' };

function DotStatus({ status }) {
  return <span className={`${styles.dot} ${styles['dot' + status.charAt(0).toUpperCase() + status.slice(1)]}`} />;
}

function Modal({ title, wide, onClose, onSave, saving, onDelete, deleting, children }) {
  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`${styles.modal} ${wide ? styles.modalWide : ''}`}>
        <p className={styles.modalTitle}>{title}</p>
        {children}
        <div className={styles.btnRow} style={{ justifyContent: onDelete ? 'space-between' : 'flex-end' }}>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting || saving}
              style={{
                background: 'transparent',
                color: '#b91c1c',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: deleting ? 'not-allowed' : 'pointer',
              }}
            >
              {deleting ? 'Archiving…' : 'Archive'}
            </button>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button className={styles.saveBtn} onClick={onSave} disabled={saving || deleting}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Angle modal ────────────────────────────────────
function AngleModal({ angle, formats, vibes, onClose, onSaved, onDeleted, onVibeCreated, onVibeDeleted }) {
  const [form, setForm] = useState({
    name: angle?.name || '',
    description: angle?.description || '',
    status: angle?.status || 'active',
    priority_weight: angle?.priority_weight || 3,
    compatible_format_ids: angle?.compatible_format_ids || [],
  });
  const [vibeIds, setVibeIds] = useState(angle?.vibe_ids || []);
  const [allVibes, setAllVibes] = useState(!!angle?.all_vibes);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleDelete() {
    if (!angle) return;
    if (!window.confirm(`Archive angle "${angle.name}"? It will disappear from your strategy board. Existing concepts that use it are unaffected.`)) return;
    setDeleting(true);
    try {
      await api.archiveAngle(angle.id);
      onDeleted(angle.id);
      onClose();
    } catch (err) { alert(err.message); setDeleting(false); }
  }

  function toggleFormat(id) {
    setForm(f => ({
      ...f,
      compatible_format_ids: f.compatible_format_ids.includes(id)
        ? f.compatible_format_ids.filter(x => x !== id)
        : [...f.compatible_format_ids, id],
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const data = {
        ...form,
        priority_weight: Number(form.priority_weight),
        vibe_ids: vibeIds,
        all_vibes: allVibes,
      };
      const saved = angle ? await api.updateAngle(angle.id, data) : await api.createAngle(data);
      onSaved(saved);
      onClose();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal
      title={angle ? 'Edit Angle' : 'New Angle'}
      onClose={onClose}
      onSave={save}
      saving={saving}
      onDelete={angle ? handleDelete : undefined}
      deleting={deleting}
    >
      <div className={styles.fieldGroup}>
        <div>
          <label className={styles.label}>Name</label>
          <input className={styles.input} value={form.name} onChange={set('name')} placeholder="Angle name" />
        </div>
        <div>
          <label className={styles.label}>Description</label>
          <textarea className={styles.textarea} value={form.description} onChange={set('description')} placeholder="What desire or insight does this angle tap?" />
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
          <label className={styles.label}>Compatible Formats</label>
          <div className={styles.checkGrid}>
            {formats.map(f => (
              <button
                key={f.id}
                type="button"
                className={`${styles.checkChip} ${form.compatible_format_ids.includes(f.id) ? styles.checkChipActive : ''}`}
                onClick={() => toggleFormat(f.id)}
              >
                {f.name}
              </button>
            ))}
          </div>
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
      </div>
    </Modal>
  );
}
// ── Copy Line modal (with priority_weight) ──
// Copy text is now a list of headlines. 1 = single_headline, 2+ = multi_headline.
// Storage: headlines joined by '\n' in copy_text; split on load.
function CopyLineModal({ copyLine, angleId, vibes, products = [], onClose, onSaved, onDeleted, onVibeCreated, onVibeDeleted }) {
  const initialHeadlines = (copyLine?.copy_text ?? '').split('\n').filter(s => s.length > 0);
  const [headlines, setHeadlines] = useState(initialHeadlines.length ? initialHeadlines : ['']);
  const [form, setForm] = useState({
    status: copyLine?.status || 'active',
    priority_weight: copyLine?.priority_weight || 3,
  });
  const [vibeIds, setVibeIds] = useState(copyLine?.vibe_ids || []);
  const [allVibes, setAllVibes] = useState(!!copyLine?.all_vibes);
  const [productIds, setProductIds] = useState(copyLine?.product_ids || []); // [] = All products
  const [highPotential, setHighPotential] = useState(!!copyLine?.high_potential);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!copyLine) return;
    if (!window.confirm('Archive this copy line? It will disappear from your strategy board. Existing concepts that use it are unaffected.')) return;
    setDeleting(true);
    try {
      await api.archiveCopyLine(copyLine.id);
      onDeleted(copyLine.id);
      onClose();
    } catch (err) { alert(err.message); setDeleting(false); }
  }

  function toggleProduct(id) {
    setProductIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  function setHeadline(idx, value) {
    setHeadlines(prev => prev.map((h, i) => i === idx ? value : h));
  }
  function addHeadline() {
    setHeadlines(prev => [...prev, '']);
  }
  function removeHeadline(idx) {
    setHeadlines(prev => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    const cleaned = headlines.map(h => h.trim()).filter(h => h.length > 0);
    if (cleaned.length === 0) { alert('Add at least one headline'); return; }
    setSaving(true);
    try {
      const data = {
        copy_text: cleaned.join('\n'),
        copy_type: cleaned.length > 1 ? 'multi_headline' : 'single_headline',
        status: form.status,
        priority_weight: Number(form.priority_weight),
        high_potential: highPotential,
        vibe_ids: vibeIds,
        all_vibes: allVibes,
        product_ids: productIds,
      };
      const saved = copyLine
        ? await api.updateCopyLine(copyLine.id, data)
        : await api.createCopyLine({ ...data, angle_id: angleId });
      onSaved(saved);
      onClose();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal
      title={copyLine ? 'Edit Copy Line' : 'New Copy Line'}
      onClose={onClose}
      onSave={save}
      saving={saving}
      onDelete={copyLine ? handleDelete : undefined}
      deleting={deleting}
    >
      <div className={styles.fieldGroup}>
        <div>
          <label className={styles.label}>
            Headlines {headlines.length > 1 && <span style={{ fontWeight: 400, color: '#857D70' }}>· auto-typed as Multiple Headline</span>}
          </label>
          {headlines.map((h, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <input
                className={styles.input}
                value={h}
                onChange={e => setHeadline(idx, e.target.value)}
                placeholder={idx === 0 ? 'First headline' : `Headline ${idx + 1}`}
                style={{ flex: 1 }}
              />
              {idx > 0 && (
                <button
                  type="button"
                  onClick={() => removeHeadline(idx)}
                  aria-label={`Remove headline ${idx + 1}`}
                  title="Remove headline"
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    border: '1px solid #E5E0D6', background: '#fff',
                    color: '#b91c1c', cursor: 'pointer',
                    fontSize: 14, lineHeight: 1, padding: 0,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addHeadline}
            style={{
              marginTop: 4, background: 'none', border: '1px dashed #C5BDB1',
              borderRadius: 8, padding: '6px 12px', fontSize: 13,
              color: '#857D70', cursor: 'pointer',
            }}
          >
            + Add headline
          </button>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={highPotential}
              onChange={e => setHighPotential(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1F1B14' }}>⭐ High Potential</span>
          </label>
          <p style={{ fontSize: 12, color: '#857D70', margin: '4px 0 0 24px' }}>
            Pins this headline to the top of the creator list and badges it (browsing + randomizer).
          </p>
        </div>
        <div>
          <label className={styles.label}>
            Products {productIds.length === 0 && <span style={{ fontWeight: 400, color: '#857D70' }}>· All products</span>}
          </label>
          <div className={styles.checkGrid}>
            <button
              type="button"
              className={`${styles.checkChip} ${productIds.length === 0 ? styles.checkChipActive : ''}`}
              onClick={() => setProductIds([])}
            >
              All products
            </button>
            {products.filter(p => p.status === 'active').map(p => (
              <button
                key={p.id}
                type="button"
                className={`${styles.checkChip} ${productIds.includes(p.id) ? styles.checkChipActive : ''}`}
                onClick={() => toggleProduct(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
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
      </div>
    </Modal>
  );
}

// ── Archived browser (v20) ────────────────────────
// Flat two-section list. Each row is greyed-out with an Unarchive button.
function ArchivedView({ angles, copyLines, onUnarchiveAngle, onUnarchiveCopyLine }) {
  const sectionStyle = { marginBottom: 24 };
  const headerStyle = {
    fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: '#857D70', marginBottom: 8,
  };
  const rowStyle = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 12px', background: '#F5F1EA', borderRadius: 10,
    marginBottom: 6, opacity: 0.75,
  };
  const archivedPill = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', background: '#e5e0d6', color: '#5c5447',
    padding: '2px 8px', borderRadius: 999,
  };
  const unarchiveBtn = {
    marginLeft: 'auto',
    padding: '6px 12px', borderRadius: 8,
    background: 'transparent', border: '1px solid #c5bdb1',
    color: '#5c5447', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  };

  return (
    <div>
      <div style={sectionStyle}>
        <p style={headerStyle}>Archived Angles · {angles.length}</p>
        {angles.length === 0 && (
          <p style={{ color: '#857D70', fontSize: 13 }}>No archived angles.</p>
        )}
        {angles.map(a => (
          <div key={a.id} style={rowStyle}>
            <span style={archivedPill}>Archived</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#5c5447', margin: 0 }}>{a.name}</p>
              {a.description && (
                <p style={{ fontSize: 12, color: '#857D70', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.description}
                </p>
              )}
            </div>
            <button style={unarchiveBtn} onClick={() => onUnarchiveAngle(a)}>Unarchive</button>
          </div>
        ))}
      </div>

      <div style={sectionStyle}>
        <p style={headerStyle}>Archived Copy Lines · {copyLines.length}</p>
        {copyLines.length === 0 && (
          <p style={{ color: '#857D70', fontSize: 13 }}>No archived copy lines.</p>
        )}
        {copyLines.map(cl => (
          <div key={cl.id} style={rowStyle}>
            <span style={archivedPill}>Archived</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, color: '#5c5447', margin: 0, whiteSpace: 'pre-line' }}>{cl.copy_text}</p>
              <p style={{ fontSize: 11, color: '#857D70', margin: '2px 0 0' }}>
                Angle: {cl.angle_name || '—'}
              </p>
            </div>
            <button style={unarchiveBtn} onClick={() => onUnarchiveCopyLine(cl)}>Unarchive</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main strategy 3-column ────────────────────────
export default function StrategyView() {
  const [angles, setAngles] = useState([]);
  const [formats, setFormats] = useState([]);
  const [vibes, setVibes] = useState([]);
  const [products, setProducts] = useState([]);
  const [copyLines, setCopyLines] = useState([]);
  const [selectedAngle, setSelectedAngle] = useState(null);

  const [angleModal, setAngleModal] = useState(null);
  const [formatModal, setFormatModal] = useState(null);
  const [copyModal, setCopyModal] = useState(null);

  // v20: archive browser. When true, render a flat list of archived angles +
  // archived copy lines (each with an Unarchive button) instead of the normal
  // 3-column strategy board.
  const [viewArchived, setViewArchived] = useState(false);
  const [archivedAngles, setArchivedAngles] = useState([]);
  const [archivedCopyLines, setArchivedCopyLines] = useState([]);

  useEffect(() => {
    api.getAngles().then(setAngles);
    api.getFormats().then(setFormats);
    api.getVibes().then(setVibes);
    api.getProducts().then(setProducts);
  }, []);

  useEffect(() => {
    if (!viewArchived) return;
    api.getAngles({ archived: true }).then(setArchivedAngles).catch(() => setArchivedAngles([]));
    api.getArchivedCopyLines().then(setArchivedCopyLines).catch(() => setArchivedCopyLines([]));
  }, [viewArchived]);

  async function handleUnarchiveAngle(a) {
    try {
      await api.unarchiveAngle(a.id);
      setArchivedAngles(prev => prev.filter(x => x.id !== a.id));
      // Refresh active list so the angle reappears.
      api.getAngles().then(setAngles);
    } catch (err) { alert(err.message); }
  }

  async function handleUnarchiveCopyLine(cl) {
    try {
      await api.unarchiveCopyLine(cl.id);
      setArchivedCopyLines(prev => prev.filter(x => x.id !== cl.id));
      // If the active board is currently showing this copy line's angle, refresh.
      if (selectedAngle && selectedAngle.id === cl.angle_id) {
        api.getCopyLinesByAngle(selectedAngle.id).then(setCopyLines);
      }
    } catch (err) { alert(err.message); }
  }

  useEffect(() => {
    if (!selectedAngle) { setCopyLines([]); return; }
    api.getCopyLinesByAngle(selectedAngle.id).then(setCopyLines);
  }, [selectedAngle]);

  function onAngleSaved(saved) {
    setAngles(prev => {
      const exists = prev.find(a => a.id === saved.id);
      return exists ? prev.map(a => a.id === saved.id ? saved : a) : [...prev, saved];
    });
    setSelectedAngle(saved);
  }

  function onFormatSaved(saved) {
    setFormats(prev => {
      const exists = prev.find(f => f.id === saved.id);
      return exists ? prev.map(f => f.id === saved.id ? saved : f) : [...prev, saved];
    });
  }

  function onFormatDeleted(id) {
    setFormats(prev => prev.filter(f => f.id !== id));
  }

  function onVibeCreated(v) {
    setVibes(prev => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)));
  }

  function onVibeDeleted(id) {
    setVibes(prev => prev.filter(v => v.id !== id));
  }

  function onCopyLineSaved(saved) {
    setCopyLines(prev => {
      const exists = prev.find(c => c.id === saved.id);
      return exists ? prev.map(c => c.id === saved.id ? saved : c) : [...prev, saved];
    });
  }

  function onAngleDeleted(id) {
    setAngles(prev => prev.filter(a => a.id !== id));
    setSelectedAngle(prev => (prev?.id === id ? null : prev));
  }

  function onCopyLineDeleted(id) {
    setCopyLines(prev => prev.filter(c => c.id !== id));
  }

  const tabBtnStyle = (active) => ({
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid',
    borderColor: active ? '#1f2937' : '#e5e0d6',
    background: active ? '#1f2937' : 'transparent',
    color: active ? '#fff' : '#5c5447',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  });

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button style={tabBtnStyle(!viewArchived)} onClick={() => setViewArchived(false)}>Active</button>
        <button style={tabBtnStyle(viewArchived)} onClick={() => setViewArchived(true)}>
          Archived
        </button>
      </div>

      {viewArchived ? (
        <ArchivedView
          angles={archivedAngles}
          copyLines={archivedCopyLines}
          onUnarchiveAngle={handleUnarchiveAngle}
          onUnarchiveCopyLine={handleUnarchiveCopyLine}
        />
      ) : (
      <div className={styles.strategyLayout}>
        <div className={styles.col}>
          <div className={styles.colHeader}>
            <span className={styles.colTitle}>Angles</span>
            <button className={styles.addBtn} onClick={() => setAngleModal('new')}>+ New</button>
          </div>
          {angles.length === 0 && <p className={styles.colEmpty}>No angles yet.</p>}
          {angles.map(a => (
            <button key={a.id} className={`${styles.varRow} ${selectedAngle?.id === a.id ? styles.varRowActive : ''}`} onClick={() => setSelectedAngle(prev => prev?.id === a.id ? null : a)}>
              <DotStatus status={a.status} />
              <div className={styles.varRowInfo}>
                <p className={styles.varRowName}>{a.name}</p>
                <p className={styles.varRowMeta}>{a.compatible_format_ids?.length || 0} formats</p>
              </div>
              <span className={styles.weightBadge}>{a.priority_weight}</span>
              <button className={styles.menuBtn} onClick={e => { e.stopPropagation(); setAngleModal(a); }}>⋯</button>
            </button>
          ))}
        </div>

        <div className={styles.col}>
          <div className={styles.colHeader}>
            <span className={styles.colTitle}>Formats</span>
            <button className={styles.addBtn} onClick={() => setFormatModal('new')}>+ New</button>
          </div>
          {formats.length === 0 && <p className={styles.colEmpty}>No formats yet.</p>}
          {formats.map(f => (
            <button key={f.id} className={styles.varRow} onClick={async () => {
              try { setFormatModal(await api.getFormat(f.id)); }
              catch { setFormatModal(f); }
            }}>
              <DotStatus status={f.status} />
              <div className={styles.varRowInfo}>
                <p className={styles.varRowName}>{f.name}</p>
                <span className={styles.typeBadge}>
                  {f.format_type
                    ? (FORMAT_TYPE_LABELS[f.format_type] || f.format_type)
                    : (Array.isArray(f.required_copy_type)
                        ? f.required_copy_type.map(t => COPY_TYPE_LABELS[t] || t).join(' + ')
                        : COPY_TYPE_LABELS[f.required_copy_type])}
                </span>
              </div>
              <span className={styles.weightBadge}>{f.priority_weight}</span>
            </button>
          ))}
        </div>

        <div className={styles.col}>
          <div className={styles.colHeader}>
            <span className={styles.colTitle}>{selectedAngle ? `Copy — ${selectedAngle.name}` : 'Copy Lines'}</span>
            {selectedAngle && (
              <button className={styles.addBtn} onClick={() => setCopyModal('new')}>+ Add</button>
            )}
          </div>
          {!selectedAngle && <p className={styles.colEmpty}>Select an angle to view its copy lines.</p>}
          {selectedAngle && copyLines.length === 0 && <p className={styles.colEmpty}>No copy lines yet.</p>}
          {copyLines.map(cl => (
            <div key={cl.id} className={styles.copyRow}>
              <div className={styles.varRowInfo} style={{ flex: 1 }}>
                <span className={styles.typeBadge}>{COPY_TYPE_LABELS[cl.copy_type]}</span>
                <p className={styles.copyText} style={{ marginTop: 4, whiteSpace: 'pre-line' }}>{cl.copy_text}</p>
              </div>
              <span className={styles.weightBadge}>{cl.priority_weight}</span>
              <button className={styles.menuBtn} onClick={() => setCopyModal(cl)}>⋯</button>
            </div>
          ))}
        </div>
      </div>
      )}

      {angleModal && (
        <AngleModal
          angle={angleModal === 'new' ? null : angleModal}
          formats={formats}
          vibes={vibes}
          onClose={() => setAngleModal(null)}
          onSaved={onAngleSaved}
          onDeleted={onAngleDeleted}
          onVibeCreated={onVibeCreated}
          onVibeDeleted={onVibeDeleted}
        />
      )}
      {formatModal && (
        <FormatBuilderModal
          format={formatModal === 'new' ? null : formatModal}
          angles={angles}
          vibes={vibes}
          onClose={() => setFormatModal(null)}
          onSaved={onFormatSaved}
          onDeleted={onFormatDeleted}
          onVibeCreated={onVibeCreated}
          onVibeDeleted={onVibeDeleted}
        />
      )}
      {copyModal && selectedAngle && (
        <CopyLineModal
          copyLine={copyModal === 'new' ? null : copyModal}
          angleId={selectedAngle.id}
          vibes={vibes}
          products={products}
          onClose={() => setCopyModal(null)}
          onSaved={onCopyLineSaved}
          onDeleted={onCopyLineDeleted}
          onVibeCreated={onVibeCreated}
          onVibeDeleted={onVibeDeleted}
        />
      )}
    </>
  );
}
