import { useEffect, useState } from 'react';
import { api } from '../../api';
import StrategistLayout from './StrategistLayout';
import styles from './Strategist.module.css';

export default function Performance() {
  const [entries, setEntries] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ concept_id: '', platform: '', views: 0, clicks: 0, conversions: 0, notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getPerformance().then(setEntries);
    api.getConcepts().then(setConcepts);
  }, []);

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })); }

  async function save() {
    setSaving(true);
    try {
      const created = await api.createPerformance({
        ...form,
        views: Number(form.views),
        clicks: Number(form.clicks),
        conversions: Number(form.conversions),
      });
      setEntries(prev => [created, ...prev]);
      setShowForm(false);
      setForm({ concept_id: '', platform: '', views: 0, clicks: 0, conversions: 0, notes: '' });
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  }

  return (
    <StrategistLayout>
      <div className={styles.pageHeader}>
        <p className={styles.pageWordmark}>VIRAL TEAM</p>
        <h1 className={styles.pageTitle}>Performance</h1>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Data</p>
          <button className={styles.addBtn} onClick={() => setShowForm(true)}>+ Log Entry</button>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Concept</th>
              <th>Angle</th>
              <th>Format</th>
              <th>Platform</th>
              <th>Views</th>
              <th>Clicks</th>
              <th>Conversions</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id}>
                <td>{e.concept_title}</td>
                <td>{e.angle_name}</td>
                <td>{e.format_name}</td>
                <td>{e.platform || '—'}</td>
                <td>{e.views.toLocaleString()}</td>
                <td>{e.clicks.toLocaleString()}</td>
                <td>{e.conversions.toLocaleString()}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{e.notes || '—'}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={8} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>No data logged yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className={styles.modal}>
            <p className={styles.modalTitle}>Log Performance Entry</p>
            <div className={styles.fieldGroup}>
              <div>
                <label className={styles.label}>Concept</label>
                <select className={styles.select} value={form.concept_id} onChange={set('concept_id')}>
                  <option value="">Select concept...</option>
                  {concepts.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                <label className={styles.label}>Platform</label>
                <input className={styles.input} value={form.platform} onChange={set('platform')} placeholder="TikTok, Meta, etc." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <label className={styles.label}>Views</label>
                  <input className={styles.input} type="number" value={form.views} onChange={set('views')} />
                </div>
                <div>
                  <label className={styles.label}>Clicks</label>
                  <input className={styles.input} type="number" value={form.clicks} onChange={set('clicks')} />
                </div>
                <div>
                  <label className={styles.label}>Conversions</label>
                  <input className={styles.input} type="number" value={form.conversions} onChange={set('conversions')} />
                </div>
              </div>
              <div>
                <label className={styles.label}>Notes</label>
                <textarea className={styles.textarea} value={form.notes} onChange={set('notes')} placeholder="Optional notes..." />
              </div>
            </div>
            <div className={styles.btnRow}>
              <button className={styles.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={save} disabled={!form.concept_id || saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </StrategistLayout>
  );
}
