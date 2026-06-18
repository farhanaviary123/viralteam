import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './Strategist.module.css';

const navItems = [
  { to: '/strategist', label: 'Overview', end: true },
  { to: '/strategist/strategy', label: 'Creative Strategy' },
  { to: '/strategist/creators', label: 'Creators' },
  { to: '/strategist/performance', label: 'Performance' },
  { to: '/strategist/guide', label: 'Guide Content' },
  { to: '/strategist/uploads', label: 'Uploads' },
];

export default function StrategistLayout({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <p className={styles.sideWordmark}>VIRAL TEAM</p>
        <ul className={styles.navList}>
          {navItems.map(item => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className={styles.sideBottom}>
          <p className={styles.sideUser}>{user?.name}</p>
          <button className={styles.logoutBtn} onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
