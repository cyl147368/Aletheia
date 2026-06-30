import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import StationDetailPage from './pages/StationDetailPage';
import ProbeResultPage from './pages/ProbeResultPage';
import ManagePage from './pages/ManagePage';
import { listStations, type Station } from './api';

function RequireAuth({ children }: { children: ReactNode }) {
  const token = localStorage.getItem('aletheia_token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('aletheia-theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('aletheia-theme', theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}

function summarizeStations(stations: Station[]) {
  if (stations.some((station) => station.status === 'down')) {
    return { label: '有异常', tone: 'bg-[var(--bad-dim)] text-[var(--bad-light)]', dot: 'bg-[var(--bad-light)] text-[var(--bad-light)]' };
  }
  if (stations.some((station) => station.status === 'degraded')) {
    return { label: '需关注', tone: 'bg-[var(--warn-dim)] text-[var(--warn-light)]', dot: 'bg-[var(--warn-light)] text-[var(--warn-light)]' };
  }
  if (stations.length === 0 || stations.some((station) => station.status === 'unknown')) {
    return { label: '待检测', tone: 'bg-[var(--surface-2)] text-[var(--ink-dim)]', dot: 'bg-[var(--ink-faint)] text-[var(--ink-faint)]' };
  }
  return { label: '运行正常', tone: 'bg-[var(--ok-dim)] text-[var(--ok-light)]', dot: 'bg-[var(--ok-light)] text-[var(--ok-light)]' };
}

function TopNav({ onLogout, onToggleTheme, theme }: { onLogout: () => void; onToggleTheme: () => void; theme: string }) {
  const [stations, setStations] = useState<Station[]>([]);

  const fetchStations = useCallback(async () => {
    try {
      setStations(await listStations());
    } catch {
      setStations([]);
    }
  }, []);

  useEffect(() => { fetchStations(); }, [fetchStations]);

  const summary = summarizeStations(stations);

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <NavLink to="/" className="brand-mark">
          <span className="brand-logo">A</span>
          <span>
            <span className="block text-[15px] font-black leading-none tracking-tight text-[var(--ink)]">Aletheia</span>
            <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-faint)]">Truth Monitor</span>
          </span>
        </NavLink>

        <nav className="topnav-links">
          <NavLink to="/" end className={({ isActive }) => `topnav-link ${isActive ? 'topnav-link-active' : ''}`}>
            总览
          </NavLink>
          <NavLink to="/manage" className={({ isActive }) => `topnav-link ${isActive ? 'topnav-link-active' : ''}`}>
            站点管理
          </NavLink>
        </nav>

        <div className="topbar-actions">
          <span className={`status-pill ${summary.tone}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${summary.dot}`} />
            {summary.label}
          </span>
          <span className="hidden rounded-full border px-3 py-1.5 font-mono text-[11px] text-[var(--ink-faint)] sm:inline-flex" style={{ borderColor: 'var(--line)' }}>
            {stations.length} stations
          </span>
          <button type="button" onClick={fetchStations} className="button-ghost">刷新</button>
          <button type="button" onClick={onToggleTheme} className="button-ghost">{theme === 'dark' ? '浅色' : '深色'}</button>
          <button type="button" onClick={onLogout} className="button-ghost">退出</button>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('aletheia_token'));
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    setToken(localStorage.getItem('aletheia_token'));
  }, []);

  const handleLogin = (nextToken: string) => {
    localStorage.setItem('aletheia_token', nextToken);
    setToken(nextToken);
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
      <div className="app-frame">
        <TopNav onLogout={handleLogout} onToggleTheme={toggleTheme} theme={theme} />
        <main className="min-w-0 flex-1">
          <Routes>
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
            <Route path="/stations/:id" element={<RequireAuth><StationDetailPage /></RequireAuth>} />
            <Route path="/stations/:id/probe/:batchId" element={<RequireAuth><ProbeResultPage /></RequireAuth>} />
            <Route path="/manage" element={<RequireAuth><ManagePage /></RequireAuth>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
