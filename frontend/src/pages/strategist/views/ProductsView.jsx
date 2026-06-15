// Products library (v12) — each product has a name + image.
// Used as a filter when randomising copy & clips for a concept.

import { useEffect, useRef, useState } from 'react';
import { api } from '../../../api';
import styles from '../Strategist.module.css';

function ProductModal({ product, onClose, onSaved }) {
  const [name, setName] = useState(product?.name || '');
  const [imageUrl, setImageUrl] = useState(product?.image_url || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const { url } = await api.uploadFile(file);
      setImageUrl(url);
    } catch (e2) { setErr(e2.message); }
    finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save() {
    if (!name.trim()) { setErr('Name is required'); return; }
    setSaving(true);
    setErr(null);
    try {
      const data = { name: name.trim(), image_url: imageUrl || null };
      const saved = product
        ? await api.updateProduct(product.id, data)
        : await api.createProduct(data);
      onSaved(saved);
      onClose();
    } catch (e2) { setErr(e2.message); }
    finally { setSaving(false); }
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <p className={styles.modalTitle}>{product ? 'Edit Product' : 'New Product'}</p>
        <div className={styles.fieldGroup}>
          <div>
            <label className={styles.label}>Name</label>
            <input
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder='e.g. "Vanilla Whey Protein"'
            />
          </div>
          <div>
            <label className={styles.label}>Image</label>
            {imageUrl && (
              <div style={{
                marginBottom: 8, borderRadius: 8, overflow: 'hidden',
                background: '#F5F1EA', position: 'relative',
              }}>
                <img src={imageUrl} alt="" style={{ width: '100%', display: 'block', maxHeight: 240, objectFit: 'cover' }} />
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  style={{
                    position: 'absolute', top: 6, right: 6,
                    background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none',
                    borderRadius: '50%', width: 24, height: 24, cursor: 'pointer',
                    fontSize: 14, lineHeight: 1,
                  }}
                >×</button>
              </div>
            )}
            <button
              type="button"
              className={styles.addBtn}
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ padding: '6px 12px', fontSize: 12 }}
            >
              {uploading ? 'Uploading…' : (imageUrl ? 'Replace image' : '+ Upload image')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={onPick}
              style={{ display: 'none' }}
            />
            <input
              type="text"
              className={styles.input}
              placeholder="…or paste an image URL"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              style={{ marginTop: 6 }}
            />
          </div>
          {err && <p style={{ color: '#b91c1c', fontSize: 13 }}>{err}</p>}
        </div>
        <div className={styles.btnRow}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

export default function ProductsView() {
  const [products, setProducts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null); // product id

  useEffect(() => {
    api.getProducts().then(setProducts);
  }, []);

  function onSaved(saved) {
    setProducts(prev => {
      const exists = prev.find(p => p.id === saved.id);
      return exists ? prev.map(p => p.id === saved.id ? saved : p) : [saved, ...prev];
    });
  }

  async function remove(id) {
    try {
      await api.deleteProduct(id);
      setProducts(prev => prev.filter(p => p.id !== id));
      setConfirmDel(null);
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div>
      <div className={styles.listToolbar}>
        <p className={styles.sectionTitle}>Products ({products.length})</p>
        <button className={styles.addBtn} onClick={() => setEditing('new')}>+ New Product</button>
      </div>

      <div className={styles.listGrid}>
        {products.map(p => (
          <div key={p.id} className={styles.itemCard} style={{ position: 'relative' }}>
            <button
              onClick={() => setEditing(p)}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                display: 'block', width: '100%', textAlign: 'left',
              }}
            >
              <div className={styles.thumbBox}>
                {p.image_url
                  ? <img src={p.image_url} alt={p.name} />
                  : <span style={{ fontSize: 11, color: '#857D70' }}>No image</span>}
              </div>
              <div className={styles.itemHeader}>
                <p className={styles.itemName}>{p.name}</p>
              </div>
            </button>
            {confirmDel === p.id ? (
              <div style={{
                position: 'absolute', top: 6, right: 6,
                background: '#fff', border: '1px solid #E5E0D6',
                borderRadius: 8, padding: 6, display: 'flex', gap: 4,
                boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
              }}>
                <button
                  onClick={() => setConfirmDel(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '2px 6px' }}
                >Cancel</button>
                <button
                  onClick={() => remove(p.id)}
                  style={{
                    background: '#dc2626', color: '#fff', border: 'none',
                    borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '2px 8px', fontWeight: 600,
                  }}
                >Delete</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDel(p.id)}
                title="Delete product"
                style={{
                  position: 'absolute', top: 6, right: 6,
                  background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none',
                  borderRadius: '50%', width: 24, height: 24, cursor: 'pointer',
                  fontSize: 14, lineHeight: 1,
                }}
              >×</button>
            )}
          </div>
        ))}
        {products.length === 0 && (
          <p className={styles.colEmpty}>No products yet. Click + New Product to add one.</p>
        )}
      </div>

      {editing && (
        <ProductModal
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
