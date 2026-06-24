import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/Badge';
import AllHeadlinesModal from '../../components/AllHeadlinesModal';
import styles from './Creator.module.css';

export default function CreatorHome() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [concepts, setConcepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllHeadlines, setShowAllHeadlines] = useState(false);

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

      <button
        type="button"
        onClick={() => setShowAllHeadlines(true)}
        style={{
          display: 'block',
          width: '100%',
          boxSizing: 'border-box',
          marginTop: 12,
          background: 'none',
          border: '1px solid #EFEADF',
          color: 'var(--green)',
          borderRadius: 12,
          padding: 14,
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        See all headlines
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
                  <button key={c.id} className={styles.conceptCard} onClick={() => navigate(`/creator/concept/${c.id}`)}>
                    <div className={`${styles.accent} ${styles.accentOrange}`} />
                    <div className={styles.conceptInfo}>
                      <p className={styles.conceptTitle}>{conceptTitle(c)}</p>
                      <p className={styles.conceptMeta}>{conceptMeta(c)}</p>
                    </div>
                    <div className={styles.conceptRight}>
                      <Badge status={c.status} />
                      <span className={styles.arrow}>→</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {done.length > 0 && (
            <section className={styles.section}>
              <p className={styles.sectionLabel}>Done</p>
              <div className={styles.list}>
                {done.map(c => (
                  <button key={c.id} className={styles.conceptCardDone} onClick={() => navigate(`/creator/concept/${c.id}`)}>
                    <p className={styles.conceptTitleDone}>{conceptTitle(c)}</p>
                    <p className={styles.conceptMetaDone}>{conceptMeta(c)}</p>
                  </button>
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

      {showAllHeadlines && <AllHeadlinesModal onClose={() => setShowAllHeadlines(false)} />}
    </div>
  );
}
