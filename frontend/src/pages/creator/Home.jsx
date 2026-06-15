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

  const inProgress = concepts.filter(c => c.status !== 'done');
  const done = concepts.filter(c => c.status === 'done');

  function openConcept(c) {
    if (c.status === 'needs_shooting') navigate(`/creator/concept/${c.id}/shoot`);
    else if (c.status === 'ready_to_edit') navigate(`/creator/concept/${c.id}/edit`);
    else navigate(`/creator/concept/${c.id}/edit`);
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
                  <button key={c.id} className={styles.conceptCard} onClick={() => openConcept(c)}>
                    <div className={`${styles.accent} ${c.status === 'needs_shooting' ? styles.accentOrange : styles.accentGreen}`} />
                    <div className={styles.conceptInfo}>
                      <p className={styles.conceptTitle}>Concept {c.sequential_number}: {c.angle_name}</p>
                      <p className={styles.conceptMeta}>{c.format_name}</p>
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
                  <button key={c.id} className={styles.conceptCardDone} onClick={() => openConcept(c)}>
                    <p className={styles.conceptTitleDone}>Concept {c.sequential_number}: {c.angle_name}</p>
                    <p className={styles.conceptMetaDone}>{c.format_name}</p>
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
    </div>
  );
}
