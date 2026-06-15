import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import Badge from '../../components/Badge';
import StrategistLayout from './StrategistLayout';
import styles from './Strategist.module.css';

export default function StrategistOverview() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [creators, setCreators] = useState([]);
  const [concepts, setConcepts] = useState([]);

  useEffect(() => {
    api.getStats().then(setStats);
    api.getCreators().then(setCreators);
    api.getConcepts().then(c => setConcepts(c.slice(0, 10)));
  }, []);

  return (
    <StrategistLayout>
      <div className={styles.pageHeader}>
        <p className={styles.pageWordmark}>VIRAL TEAM</p>
        <h1 className={styles.pageTitle}>Good morning, {user?.name?.split(' ')[0]}.</h1>
      </div>

      {stats && (
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <p className={styles.statValue}>{stats.angles.active}</p>
            <p className={styles.statLabel}>Active angles</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statValue}>{stats.formats.active}</p>
            <p className={styles.statLabel}>Active formats</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statValue}>{stats.copy_lines.active}</p>
            <p className={styles.statLabel}>Active copy lines</p>
          </div>
          {stats.clips && (
            <div className={styles.statCard}>
              <p className={styles.statValue}>{stats.clips.active}</p>
              <p className={styles.statLabel}>Active clips</p>
            </div>
          )}
          {stats.clip_structures && (
            <div className={styles.statCard}>
              <p className={styles.statValue}>{stats.clip_structures.active}</p>
              <p className={styles.statLabel}>Active clip structures</p>
            </div>
          )}
          {stats.songs && (
            <div className={styles.statCard}>
              <p className={styles.statValue}>{stats.songs.active}</p>
              <p className={styles.statLabel}>Active songs</p>
            </div>
          )}
          {stats.hooks && (
            <div className={styles.statCard}>
              <p className={styles.statValue}>{stats.hooks.active}</p>
              <p className={styles.statLabel}>Active hooks</p>
            </div>
          )}
          <div className={styles.statCard}>
            <p className={styles.statValue}>{stats.concepts_this_week}</p>
            <p className={styles.statLabel}>Concepts built this week</p>
          </div>
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Creator Activity</p>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Built</th>
              <th>Shot</th>
              <th>Edited</th>
            </tr>
          </thead>
          <tbody>
            {creators.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.concepts_built}</td>
                <td>{c.concepts_shot}</td>
                <td>{c.concepts_edited}</td>
              </tr>
            ))}
            {creators.length === 0 && (
              <tr><td colSpan={4} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>No creators yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {stats && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>System Health</p>
          </div>
          <div className={styles.healthGrid}>
            {[
              { label: 'Angles', data: stats.angles },
              { label: 'Formats', data: stats.formats },
              { label: 'Copy Lines', data: stats.copy_lines },
              ...(stats.clips ? [{ label: 'Clips', data: stats.clips }] : []),
              ...(stats.clip_structures ? [{ label: 'Clip Structures', data: stats.clip_structures }] : []),
              ...(stats.songs ? [{ label: 'Songs', data: stats.songs }] : []),
              ...(stats.hooks ? [{ label: 'Hooks', data: stats.hooks }] : []),
            ].map(({ label, data }) => (
              <div key={label} className={styles.healthCard}>
                <p className={styles.healthTitle}>{label}</p>
                <div className={styles.healthRow}><span>Active</span><span className={styles.healthNum}>{data.active}</span></div>
                <div className={styles.healthRow}><span>Paused</span><span className={styles.healthNum}>{data.paused}</span></div>
                <div className={styles.healthRow}><span>Retired</span><span className={styles.healthNum}>{data.retired}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Recent Concepts</p>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Creator</th>
              <th>Angle</th>
              <th>Format</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {concepts.map(c => (
              <tr key={c.id}>
                <td>{c.title}</td>
                <td>{c.creator_name}</td>
                <td>{c.angle_name}</td>
                <td>{c.format_name}</td>
                <td><Badge status={c.status} /></td>
              </tr>
            ))}
            {concepts.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>No concepts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </StrategistLayout>
  );
}
