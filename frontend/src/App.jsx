import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import Login from './pages/Login';
import Register from './pages/Register';

import CreatorHome from './pages/creator/Home';
import Step1Format from './pages/creator/builder/Step1Format';
import ShootPhase from './pages/creator/concept/ShootPhase';
import HookInspiration from './pages/creator/concept/HookInspiration';
import FormatLibrary from './pages/creator/concept/FormatLibrary';
import EditPhase from './pages/creator/concept/EditPhase';

import StrategistOverview from './pages/strategist/Overview';
import CreativeStrategy from './pages/strategist/CreativeStrategy';
import Creators from './pages/strategist/Creators';
import Performance from './pages/strategist/Performance';

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

        {/* Creator */}
        <Route path="/creator" element={<Guard role="creator"><CreatorHome /></Guard>} />
        <Route path="/creator/new" element={<Guard role="creator"><Step1Format /></Guard>} />
        <Route path="/creator/concept/:id/shoot" element={<Guard role="creator"><ShootPhase /></Guard>} />
        <Route path="/creator/concept/:id/hooks" element={<Guard role="creator"><HookInspiration /></Guard>} />
        <Route path="/creator/concept/:id/library" element={<Guard role="creator"><FormatLibrary /></Guard>} />
        <Route path="/creator/concept/:id/edit" element={<Guard role="creator"><EditPhase /></Guard>} />

        {/* Strategist */}
        <Route path="/strategist" element={<Guard role="strategist"><StrategistOverview /></Guard>} />
        <Route path="/strategist/strategy" element={<Guard role="strategist"><CreativeStrategy /></Guard>} />
        <Route path="/strategist/creators" element={<Guard role="strategist"><Creators /></Guard>} />
        <Route path="/strategist/performance" element={<Guard role="strategist"><Performance /></Guard>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
