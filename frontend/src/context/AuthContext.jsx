import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('sm_token');
    if (!token) { setLoading(false); return; }
    api.me()
      .then(setUser)
      .catch(() => localStorage.removeItem('sm_token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { user, token } = await api.login({ email, password });
    localStorage.setItem('sm_token', token);
    setUser(user);
    return user;
  }

  async function register(email, name, password, role, passcode) {
    const body = { email, name, password, role };
    if (role === 'strategist') body.passcode = passcode;
    const { user, token } = await api.register(body);
    localStorage.setItem('sm_token', token);
    setUser(user);
    return user;
  }

  function logout() {
    localStorage.removeItem('sm_token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
