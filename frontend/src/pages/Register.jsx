import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Auth.module.css';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'creator', passcode: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (form.role === 'strategist' && !form.passcode.trim()) {
      setError('Strategist passcode required');
      setLoading(false);
      return;
    }
    try {
      const user = await register(form.email, form.name, form.password, form.role, form.passcode);
      navigate(user.role === 'strategist' ? '/strategist' : '/creator');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p className={styles.wordmark}>VIRAL TEAM</p>
        <h1 className={styles.heading}>Create account.</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input className={styles.input} type="text" placeholder="Full name" value={form.name} onChange={set('name')} required />
          <input className={styles.input} type="email" placeholder="Email" value={form.email} onChange={set('email')} required />
          <input className={styles.input} type="password" placeholder="Password" value={form.password} onChange={set('password')} required />
          <div className={styles.roleRow}>
            {['creator', 'strategist'].map(r => (
              <button
                key={r}
                type="button"
                className={`${styles.roleBtn} ${form.role === r ? styles.roleBtnActive : ''}`}
                onClick={() => setForm(f => ({ ...f, role: r }))}
              >
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
          {form.role === 'strategist' && (
            <input
              className={styles.input}
              type="password"
              placeholder="Strategist passcode"
              value={form.passcode}
              onChange={set('passcode')}
              required
              autoComplete="off"
            />
          )}
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.btn} disabled={loading}>{loading ? 'Creating...' : 'Create account'}</button>
        </form>
        <p className={styles.footer}>Have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  );
}
