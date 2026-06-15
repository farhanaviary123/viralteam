import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../../api';
import ReferenceModal from '../../../components/ReferenceModal';
import styles from '../Creator.module.css';

const TIME_OF_DAY = ['', 'morning', 'afternoon', 'evening', 'night'];
const LIGHTING    = ['', 'natural', 'studio', 'dark'];
const LOCATION    = ['', 'indoor', 'outdoor', 'on_the_go'];
const LOCATION_LABELS = { indoor: 'Indoor', outdoor: 'Outdoor', on_the_go: 'On the go' };
const labelOrAll = (v) => v ? (LOCATION_LABELS[v] || v) : 'Any';

export default function FormatLibrary() {
  const { id } = useParams();              // concept id (used for "back" link)
  const navigate = useNavigate();
  const [concept, setConcept] = useState(null);
  const [examples, setExamples] = useState([]);
  const [filters, setFilters] = useState({ time_of_day: '', lighting: '', location: '' });
  const [refUrl, setRefUrl] = useState(null);

  useEffect(() => {
    api.getConcept(id).then(setConcept);
  }, [id]);

  useEffect(() => {
    if (!concept?.format_id) return;
    api.getFormatExamples(concept.format_id, filters).then(setExamples);
  }, [concept?.format_id, filters.time_of_day, filters.lighting, filters.location]);

  function setFilter(k, v) {
    setFilters(f => ({ ...f, [k]: v }));
  }

  return (
    <div className={styles.detailPage}>
      <button className={styles.backLink} onClick={() => navigate(`/creator/concept/${id}/shoot`)}>
        ← Back to shoot
      </button>

      <h1 className={styles.builderHeading}>References.</h1>
      <p className={styles.builderSub}>Browse more inspiration for this format. Filter by time of day, lighting, location.</p>

      <div className={styles.filterRow}>
        <select value={filters.time_of_day} onChange={e => setFilter('time_of_day', e.target.value)}>
          {TIME_OF_DAY.map(v => <option key={v} value={v}>{v ? `Time: ${v}` : 'Time: Any'}</option>)}
        </select>
        <select value={filters.lighting} onChange={e => setFilter('lighting', e.target.value)}>
          {LIGHTING.map(v => <option key={v} value={v}>{v ? `Lighting: ${v}` : 'Lighting: Any'}</option>)}
        </select>
        <select value={filters.location} onChange={e => setFilter('location', e.target.value)}>
          {LOCATION.map(v => <option key={v} value={v}>{`Location: ${labelOrAll(v)}`}</option>)}
        </select>
      </div>

      <div className={styles.libraryGrid}>
        {examples.length === 0 && (
          <p className={styles.empty} style={{ gridColumn: '1 / -1' }}>No references match those filters.</p>
        )}
        {examples.map(ex => (
          <button
            key={ex.id}
            type="button"
            className={styles.libraryCard}
            onClick={() => setRefUrl(ex.media_url)}
          >
            <div className={styles.libraryThumb}>
              <video
                src={ex.media_url}
                autoPlay
                loop
                muted
                playsInline
                controls
              />
              {ex.is_main && <span className={styles.libraryMainBadge}>★ Main</span>}
            </div>
            <div className={styles.libraryTags}>
              <span>{ex.time_of_day}</span>
              <span>{ex.lighting}</span>
              <span>{LOCATION_LABELS[ex.location] || ex.location}</span>
            </div>
          </button>
        ))}
      </div>

      {refUrl && <ReferenceModal url={refUrl} alt="Reference" onClose={() => setRefUrl(null)} />}
    </div>
  );
}
