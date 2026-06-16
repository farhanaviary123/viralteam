import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/Badge';
import styles from './Creator.module.css';

export default function CreatorHome() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [concepts, setConcepts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getConcepts().then(setConcepts).finally(() => setLoading(false));
  }, []);

  // v21 Guide flow: concepts are static records — 'complete' (uploaded to
  // Playbook) vs everything else still awaiting upload. Legacy statuses
  // (needs_shooting/ready_to_edit) count as in-progress too.
  const inProgress = concepts.filter(c => c.status !== 'done' && c.status !== 'complete');
  const done = concepts.filter(c => c.status === 'done' || c.status === 'complete');

  // Guide concepts carry no angle; their title is already "Concept N".
  // Legacy concepts use "Concept N: <angle>".
  function conceptTitle(c) {
    if (c.angle_name) return `Concept ${c.sequential_number}: ${c.angle_name}`;
    return c.title || `Concept ${c.sequential_number}`;
  }
  function conceptMeta(c) {
    if (c.format_name) return c.format_name;
    if (c.creative_path === 'from_video') return 'From a viral video';
    if (c.creative_path === 'from_text') return 'From a text';
    return '';
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.wordmark}>VIRAL TEAM</p>
        <button className={styles.logoutBtn} onClick={logout}>Sign out</button>
      </header>

      <h1 className={styles.pageTitle}>My Concepts</h1>

      <button className={styles.newBtn} onClick={() => navigate('/creator/new')}>
        + New Concept
      </button>

      {loading ? (
        <p className={styles.empty}>Loading...</p>
      ) : (
        <>
          {inProgress.length > 0 && (
            <section className={styles.section}>
              <p className={styles.sectionLabel}>In Progress</p>
              <div className={styles.list}>
                {inProgress.map(c => (
                  <div key={c.id} className={styles.conceptCard}>
                    <div className={`${styles.accent} ${styles.accentOrange}`} />
                    <div className={styles.conceptInfo}>
                      <p className={styles.conceptTitle}>{conceptTitle(c)}</p>
                      <p className={styles.conceptMeta}>{conceptMeta(c)}</p>
                    </div>
                    <div className={styles.conceptRight}>
                      <Badge status={c.status} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {done.length > 0 && (
            <section className={styles.section}>
              <p className={styles.sectionLabel}>Done</p>
              <div className={styles.list}>
                {done.map(c => (
                  <div key={c.id} className={styles.conceptCardDone}>
                    <p className={styles.conceptTitleDone}>{conceptTitle(c)}</p>
                    <p className={styles.conceptMetaDone}>{conceptMeta(c)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {concepts.length === 0 && (
            <p className={styles.empty}>No concepts yet. Tap + New Concept to start.</p>
          )}
        </>
      )}

      <nav className={styles.bottomNav}>
        <button className={`${styles.navItem} ${styles.navActive}`}>Home</button>
        <button className={styles.navItem} disabled style={{ opacity: 0.4, cursor: 'not-allowed' }}>History</button>
      </nav>
    </div>
  );
}
