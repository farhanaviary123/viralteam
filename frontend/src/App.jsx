import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import Login from './pages/Login';
import Register from './pages/Register';

import CreatorHome from './pages/creator/Home';
import Guide from './pages/creator/Guide';

import StrategistOverview from './pages/strategist/Overview';
import CreativeStrategy from './pages/strategist/CreativeStrategy';
import Creators from './pages/strategist/Creators';
import Performance from './pages/strategist/Performance';
import GuideContentEditor from './pages/strategist/GuideContentEditor';

function Guard({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh', color:'var(--text-secondary)', fontSize:14 }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={user.role === 'strategist' ? '/strategist' : '/creator'} replace />;
  return children;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'strategist' ? '/strategist' : '/creator'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Creator — v21: 3-step Guide wizard replaces the old builder/shoot/edit flow */}
        <Route path="/creator" element={<Guard role="creator"><CreatorHome /></Guard>} />
        <Route path="/creator/new" element={<Guard role="creator"><Guide /></Guard>} />

        {/* Strategist */}
        <Route path="/strategist" element={<Guard role="strategist"><StrategistOverview /></Guard>} />
        <Route path="/strategist/strategy" element={<Guard role="strategist"><CreativeStrategy /></Guard>} />
        <Route path="/strategist/creators" element={<Guard role="strategist"><Creators /></Guard>} />
        <Route path="/strategist/performance" element={<Guard role="strategist"><Performance /></Guard>} />
        <Route path="/strategist/guide" element={<Guard role="strategist"><GuideContentEditor /></Guard>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
