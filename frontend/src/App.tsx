import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
    <nav className="bg-slate-900 text-white px-6 py-3 flex items-center gap-6 shadow">
      <a href="/" className="text-lg font-bold tracking-wide">Aletheia</a>
      <div className="flex gap-4 text-sm">
        <a href="/" className="hover:text-blue-300 transition">看板</a>
        <a href="/manage" className="hover:text-blue-300 transition">管理</a>
      </div>
      <div className="ml-auto">
        <button onClick={onLogout} className="text-sm text-slate-400 hover:text-white transition">
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