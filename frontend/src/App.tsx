import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import StationDetailPage from './pages/StationDetailPage';
import ProbeResultPage from './pages/ProbeResultPage';
import ManagePage from './pages/ManagePage';

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

function TopNav({ onLogout, onToggleTheme, theme }: { onLogout: () => void; onToggleTheme: () => void; theme: string }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <NavLink to="/" className="brand-mark">
          <span className="brand-logo">A</span>
          <span>
            <span className="block text-[15px] font-black leading-none tracking-tight text-[var(--ink)]">Aletheia</span>
            <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-faint)]">Truth Monitor</span>
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
          <button type="button" onClick={onToggleTheme} className="btn-ghost">{theme === 'dark' ? '浅色' : '深色'}</button>
          <button type="button" onClick={onLogout} className="btn-ghost">退出</button>
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
