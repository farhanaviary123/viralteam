import { useEffect, useState } from 'react';
import { api } from '../../api';
import StrategistLayout from './StrategistLayout';

// Lists every concept that has creator-uploaded footage, with per-file
// download links. Files are stored in the DB (concept_uploads) and streamed
// via the download endpoint.

const card = { background: '#fff', border: '1px solid #E6E0D4', borderRadius: 12, padding: 18, marginBottom: 14 };
const btn = {
  border: '1px solid #D8D1C4', background: '#fff', borderRadius: 8,
  padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: '#3A352C',
};

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function ConceptRow({ row }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState(null);

  function toggle() {
    setOpen(o => !o);
    if (files === null) {
      api.getConceptUploads(row.concept_id).then(setFiles).catch(() => setFiles([]));
    }
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#1F1B14' }}>{row.title || 'Concept'}</p>
          <p style={{ fontSize: 12.5, color: '#857D70', margin: '3px 0 0' }}>
            {row.creator_name} · {row.file_count} file{row.file_count > 1 ? 's' : ''} · {fmtSize(row.total_size)}
            {row.creative_path && ` · ${row.creative_path === 'from_video' ? 'From a viral video' : 'From a text'}`}
          </p>
        </div>
        <button style={btn} onClick={toggle}>{open ? 'Hide' : 'View files'}</button>
      </div>

      {open && (
        <div style={{ marginTop: 14, borderTop: '1px solid #F0EBE0', paddingTop: 12 }}>
          {files === null && <p style={{ fontSize: 13, color: '#857D70' }}>Loading…</p>}
          {files && files.length === 0 && <p style={{ fontSize: 13, color: '#857D70' }}>No files.</p>}
          {files && files.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 0' }}>
              <span style={{ fontSize: 13, color: '#1F1B14', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', flex: '0 0 auto' }}>
                <span style={{ fontSize: 11.5, color: '#857D70' }}>{fmtSize(f.size)}</span>
                <button style={btn} onClick={() => api.downloadConceptUpload(f.id, f.filename)}>↓ Download</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Uploads() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.getConceptUploadsSummary().then(setRows).catch(e => setErr(e.message));
  }, []);

  return (
    <StrategistLayout>
      <div style={{ padding: '28px 32px', maxWidth: 760 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px' }}>Uploads</h1>
        <p style={{ fontSize: 13, color: '#857D70', marginTop: 0, marginBottom: 22 }}>
          Footage uploaded by creators. Download and move to Playbook.
        </p>
        {err && <p style={{ color: '#B0392B', fontSize: 13 }}>{err}</p>}
        {rows === null && !err && <p style={{ fontSize: 13, color: '#857D70' }}>Loading…</p>}
        {rows && rows.length === 0 && <p style={{ fontSize: 13, color: '#857D70' }}>No uploads yet.</p>}
        {rows && rows.map(r => <ConceptRow key={r.concept_id} row={r} />)}
      </div>
    </StrategistLayout>
  );
}
