import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import StationDetailPage from './pages/StationDetailPage';
import ProbeResultPage from './pages/ProbeResultPage';
import ManagePage from './pages/ManagePage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('aletheia_token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function NavBar({ onLogout }: { onLogout: () => void }) {
  return (
    <nav className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-6 py-4 flex items-center gap-8 shadow-lg border-b border-slate-700">
      <Link to="/" className="text-xl font-bold tracking-wide bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
        Aletheia
      </Link>
      <div className="flex gap-6 text-sm">
        <Link to="/" className="px-3 py-1.5 rounded-lg hover:bg-slate-700/50 transition font-medium">看板</Link>
        <Link to="/manage" className="px-3 py-1.5 rounded-lg hover:bg-slate-700/50 transition font-medium">管理</Link>
      </div>
      <div className="ml-auto flex items-center gap-4">
        <span className="text-xs text-slate-400">中转站探测系统</span>
        <button onClick={onLogout} className="text-sm text-slate-400 hover:text-red-400 transition px-3 py-1.5 rounded-lg hover:bg-slate-700/50">
          退出
        </button>
      </div>
    </nav>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('aletheia_token'));

  useEffect(() => {
    setToken(localStorage.getItem('aletheia_token'));
  }, []);

  const handleLogin = (t: string) => {
    localStorage.setItem('aletheia_token', t);
    setToken(t);
  };

  const handleLogout = () => {
    localStorage.removeItem('aletheia_token');
    setToken(null);
  };

  if (!token) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <NavBar onLogout={handleLogout} />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/stations/:id" element={<RequireAuth><StationDetailPage /></RequireAuth>} />
          <Route path="/stations/:id/probe/:batchId" element={<RequireAuth><ProbeResultPage /></RequireAuth>} />
          <Route path="/manage" element={<RequireAuth><ManagePage /></RequireAuth>} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}