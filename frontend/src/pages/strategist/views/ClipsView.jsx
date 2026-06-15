// v7 — unified Clip Library (replaces separate Clips + Hooks tabs).
// Filter by format pill. Each clip card shows name, description, format
// tags, ★ if is_hook, ×2 if variation_safe.

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../api';
import MediaUpload from '../../../components/MediaUpload';
import styles from '../Strategist.module.css';

function isImageUrl(u) {
  return u && /\.(gif|png|jpe?g|webp|svg)(\?.*)?$/i.test(u);
}

function ClipExamplesSection({ clipId }) {
  const [examples, setExamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    let on = true;
    setLoading(true);
    api.getClipExamples(clipId)
      .then(rows => { if (on) setExamples(rows); })
      .catch(e => { if (on) setErr(e.message); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [clipId]);

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const { url } = await api.uploadFile(file);
      const created = await api.createClipExample(clipId, { url });
      setExamples(prev => [...prev, created]);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeExample(id) {
    if (!confirm('Delete this example?')) return;
    try {
      await api.deleteClipExample(id);
      setExamples(prev => prev.filter(e => e.id !== id));
    } catch (e2) {
      setErr(e2.message);
    }
  }

  const primary = examples[0];
  const rest = examples.slice(1);

  return (
    <div style={{ borderTop: '1px solid #EBE6DD', paddingTop: 16, marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <label className={styles.label} style={{ marginBottom: 0 }}>Examples</label>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          style={{ padding: '4px 10px', fontSize: 12 }}
        >
          {busy ? 'Uploading…' : '+ Add example'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/gif,image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
          onChange={onPick}
          style={{ display: 'none' }}
        />
      </div>

      {loading && <p className={styles.colEmpty} style={{ fontSize: 12 }}>Loading…</p>}

      {!loading && examples.length === 0 && (
        <p className={styles.colEmpty} style={{ fontSize: 12 }}>
          No examples yet. Upload one to show creators how this shot should look.
        </p>
      )}

      {primary && (
        <div style={{ position: 'relative', marginBottom: 8, borderRadius: 8, overflow: 'hidden', background: '#000' }}>
          {isImageUrl(primary.url)
            ? <img src={primary.url} alt="" style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'cover' }} />
            : <video src={primary.url} controls style={{ width: '100%', display: 'block', maxHeight: 280 }} />}
          <span style={{
            position: 'absolute', top: 6, left: 6,
            background: 'rgba(0,0,0,0.6)', color: '#fff',
            fontSize: 10, fontWeight: 700,
            padding: '2px 8px', borderRadius: 999,
          }}>Primary</span>
          <button
            type="button"
            onClick={() => removeExample(primary.id)}
            style={{
              position: 'absolute', top: 6, right: 6,
              background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none',
              borderRadius: '50%', width: 24, height: 24, cursor: 'pointer',
              fontSize: 14, lineHeight: 1,
            }}
            title="Delete example"
          >×</button>
        </div>
      )}

      {rest.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6 }}>
          {rest.map(ex => (
            <div key={ex.id} style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 6, overflow: 'hidden', background: '#000' }}>
              {isImageUrl(ex.url)
                ? <img src={ex.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <video src={ex.url} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              <button
                type="button"
                onClick={() => removeExample(ex.id)}
                style={{
                  position: 'absolute', top: 2, right: 2,
                  background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none',
                  borderRadius: '50%', width: 20, height: 20, cursor: 'pointer',
                  fontSize: 12, lineHeight: 1,
                }}
                title="Delete example"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {err && <p style={{ color: '#b91c1c', fontSize: 12, marginTop: 6 }}>{err}</p>}
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

function ClipModal({ clip, formats, products, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState({
    name: clip?.name || '',
    description: clip?.description || '',
    reference_url: clip?.reference_url || '',
    is_hook: !!clip?.is_hook,
    // Default new clips to body-eligible. Existing clips keep their value
    // (column added in v9 with default true, so missing → true).
    body_eligible: clip ? clip.body_eligible !== false : true,
    status: clip?.status || 'active',
    weight: clip?.weight || 3,
  });
  const [productIds, setProductIds] = useState(clip?.product_ids || []); // [] = All products

  function toggleProduct(id) {
    setProductIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [usage, setUsage] = useState(null);
  const [err, setErr] = useState(null);

  async function openConfirm() {
    setErr(null);
    setUsage(null);
    setConfirmDel(true);
    if (clip?.id) {
      try { setUsage(await api.getClipUsage(clip.id)); }
      catch { /* fall through — confirm still works without usage info */ }
    }
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setBool = k => e => setForm(f => ({ ...f, [k]: e.target.checked }));

  async function save() {
    setErr(null);
    if (!form.name.trim()) { setErr('Name is required'); return; }
    if (!form.is_hook && !form.body_eligible) { setErr('Pick at least one type (Hook / Body clip)'); return; }
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        description: form.description || null,
        reference_url: form.reference_url || null,
        is_hook: form.is_hook,
        body_eligible: form.body_eligible,
        status: form.status,
        weight: Number(form.weight),
        product_ids: productIds,
      };
      const saved = clip ? await api.updateClip(clip.id, data) : await api.createClip(data);
      onSaved(saved);
      onClose();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api.deleteClip(clip.id);
      onDeleted(clip.id);
      onClose();
    } catch (e) { setErr(e.message); setDeleting(false); }
  }

  return (
    <Modal title={clip ? 'Edit Clip' : 'New Clip'} onClose={onClose} onSave={save} saving={saving}>
      <div className={styles.fieldGroup}>
        <div>
          <label className={styles.label}>Name</label>
          <input className={styles.input} value={form.name} onChange={set('name')} placeholder='e.g. "Charm close-up"' />
        </div>
        <div>
          <label className={styles.label}>Description</label>
          <textarea className={styles.textarea} value={form.description} onChange={set('description')} placeholder="How to execute this shot..." />
        </div>
        <div>
          <MediaUpload
            label="Reference (GIF / video)"
            url={form.reference_url}
            setUrl={(u) => setForm(f => ({ ...f, reference_url: u }))}
          />
        </div>

        <div>
          <label className={styles.label}>Type (pick at least one) *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, is_hook: !f.is_hook }))}
              style={{
                border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700,
                padding: '6px 14px', borderRadius: 999,
                background: form.is_hook ? '#FCD34D' : '#F5F1EA',
                color: form.is_hook ? '#78350F' : '#857D70',
                opacity: form.is_hook ? 1 : 0.7,
              }}
            >
              ★ Hook
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, body_eligible: !f.body_eligible }))}
              style={{
                border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700,
                padding: '6px 14px', borderRadius: 999,
                background: form.body_eligible ? '#3B82F6' : '#F5F1EA',
                color: form.body_eligible ? '#fff' : '#857D70',
                opacity: form.body_eligible ? 1 : 0.7,
              }}
            >
              ● Body clip
            </button>
          </div>
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

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className={styles.label}>Weight (1–5)</label>
            <select className={styles.select} value={form.weight} onChange={set('weight')}>
              {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className={styles.label}>Status</label>
            <select className={styles.select} value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="retired">Retired</option>
            </select>
          </div>
        </div>

        {err && <p style={{ color: '#b91c1c', fontSize: 13 }}>{err}</p>}

        {clip?.id && <ClipExamplesSection clipId={clip.id} />}

        {clip && (
          <div style={{ marginTop: 8 }}>
            {!confirmDel ? (
              <button type="button" className={styles.cancelBtn} onClick={openConfirm} style={{ color: '#b91c1c' }}>
                Delete clip
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {usage && usage.arrangement_count > 0 ? (
                  <div style={{
                    fontSize: 13, color: '#7f1d1d',
                    background: '#FEF2F2', border: '1px solid #FECACA',
                    borderRadius: 6, padding: '8px 10px', lineHeight: 1.4,
                  }}>
                    ⚠️ This clip is used in {usage.arrangement_count} arrangement{usage.arrangement_count === 1 ? '' : 's'}
                    {usage.formats?.length > 0 && (
                      <> across format{usage.formats.length === 1 ? '' : 's'}: <strong>{usage.formats.map(f => f.name).join(', ')}</strong></>
                    )}. Deleting it will remove it from those arrangements. Are you sure?
                  </div>
                ) : (
                  <span style={{ fontSize: 13, color: '#7f1d1d' }}>Delete permanently?</span>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className={styles.cancelBtn} onClick={() => setConfirmDel(false)}>Cancel</button>
                  <button type="button" className={styles.saveBtn} onClick={remove} disabled={deleting} style={{ background: '#dc2626' }}>
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function ClipsView() {
  const [allClips, setAllClips] = useState([]);
  const [formats, setFormats] = useState([]);
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all' | format_id
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    api.getClips().then(setAllClips);
    api.getFormats().then(setFormats);
    api.getProducts().then(setProducts);
  }, []);

  const visible = useMemo(() => {
    if (filter === 'all') return allClips;
    if (filter === 'hooks') return allClips.filter(c => c.is_hook);
    if (filter === 'body') return allClips.filter(c => c.body_eligible !== false);
    return allClips.filter(c => (c.format_ids || []).includes(filter));
  }, [allClips, filter]);

  function onSaved(saved) {
    setAllClips(prev => {
      const exists = prev.find(c => c.id === saved.id);
      return exists ? prev.map(c => c.id === saved.id ? saved : c) : [saved, ...prev];
    });
  }

  function onDeleted(id) {
    setAllClips(prev => prev.filter(c => c.id !== id));
  }

  return (
    <div>
      <div className={styles.listToolbar}>
        <p className={styles.sectionTitle}>Clip Library ({visible.length})</p>
        <button className={styles.addBtn} onClick={() => setEditing('new')}>+ New Clip</button>
      </div>

      <div className={styles.checkGrid} style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`${styles.checkChip} ${filter === 'all' ? styles.checkChipActive : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({allClips.length})
        </button>
        <button
          type="button"
          className={`${styles.checkChip} ${filter === 'hooks' ? styles.checkChipActive : ''}`}
          onClick={() => setFilter('hooks')}
        >
          ★ Hooks ({allClips.filter(c => c.is_hook).length})
        </button>
        <button
          type="button"
          className={`${styles.checkChip} ${filter === 'body' ? styles.checkChipActive : ''}`}
          onClick={() => setFilter('body')}
        >
          ● Body ({allClips.filter(c => c.body_eligible !== false).length})
        </button>
        {formats.map(f => {
          const count = allClips.filter(c => (c.format_ids || []).includes(f.id)).length;
          return (
            <button
              key={f.id}
              type="button"
              className={`${styles.checkChip} ${filter === f.id ? styles.checkChipActive : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.name} ({count})
            </button>
          );
        })}
      </div>

      <div className={styles.listGrid}>
        {visible.map(c => {
          const url = c.reference_url;
          const isImage = url && /\.(gif|png|jpe?g|webp|svg)(\?.*)?$/i.test(url);
          return (
            <button key={c.id} className={styles.itemCard} onClick={() => setEditing(c)}>
              <div className={styles.thumbBox} style={{ position: 'relative' }}>
                {url
                  ? (isImage
                      ? <img src={url} alt={c.name} />
                      : <video src={url} autoPlay loop muted playsInline />)
                  : <span style={{ fontSize: 11, color: '#857D70' }}>No reference</span>}
                <div style={{
                  position: 'absolute', top: 6, left: 6,
                  display: 'flex', gap: 4,
                }}>
                  {c.is_hook && (
                    <span style={{
                      background: '#FCD34D', color: '#78350F',
                      fontSize: 11, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 999,
                    }}>★ Hook</span>
                  )}
                  {c.body_eligible !== false && (
                    <span style={{
                      background: '#3B82F6', color: '#fff',
                      fontSize: 11, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 999,
                    }}>● Body</span>
                  )}
                </div>
              </div>
              <div className={styles.itemHeader}>
                <DotStatus status={c.status} />
                <p className={styles.itemName}>{c.name}</p>
              </div>
              {c.description && <p className={styles.itemDesc}>{c.description}</p>}
              {c.format_names && c.format_names.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {c.format_names.map(n => (
                    <span key={n} style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 999,
                      background: '#EBE6DD', color: '#857D70', fontWeight: 600,
                    }}>{n}</span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className={styles.colEmpty}>
            {allClips.length === 0 ? 'No clips yet. Click + New Clip to start.' : 'No clips for this filter.'}
          </p>
        )}
      </div>

      {editing && (
        <ClipModal
          clip={editing === 'new' ? null : editing}
          formats={formats}
          products={products}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}
