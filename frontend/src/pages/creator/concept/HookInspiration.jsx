import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../../api';
import ReferenceModal from '../../../components/ReferenceModal';
import styles from '../Creator.module.css';

export default function HookInspiration() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [hooks, setHooks] = useState([]);
  const [refUrl, setRefUrl] = useState(null);

  useEffect(() => {
    Promise.all([api.getConcept(id), api.getClips()]).then(([, clips]) => {
      const filtered = clips.filter(c => c.is_hook && c.status === 'active');
      setHooks(filtered);
    });
  }, [id]);

  return (
    <div className={styles.builderPage}>
      <button className={styles.backLink} onClick={() => navigate(`/creator/concept/${id}/shoot`)}>
        ← Back to shoot
      </button>

      <h1 className={styles.builderHeading}>Hook inspiration.</h1>
      <p className={styles.builderSub}>Browse references — shoot a different hook for each variation.</p>

      <div className={styles.formatGrid}>
        {hooks.map(h => (
          <button
            key={h.id}
            type="button"
            className={styles.formatCard}
            onClick={() => h.reference_url && setRefUrl(h.reference_url)}
          >
            <div className={styles.formatThumb}>
              {h.reference_url
                ? <img src={h.reference_url} alt={h.name} />
                : <div className={styles.thumbPlaceholder} />}
            </div>
            <div className={styles.formatBody}>
              <p className={styles.formatName}>{h.name}</p>
              {h.description && <p className={styles.formatDesc}>{h.description}</p>}
            </div>
          </button>
        ))}
        {hooks.length === 0 && (
          <p className={styles.empty} style={{ gridColumn: '1 / -1' }}>No hooks yet.</p>
        )}
      </div>

      {refUrl && <ReferenceModal url={refUrl} alt="Hook reference" onClose={() => setRefUrl(null)} />}
    </div>
  );
}
