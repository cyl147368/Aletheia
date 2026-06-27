import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
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
  const navLink = ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition',
      isActive
        ? 'bg-[var(--surface-2)] text-[var(--ink)] ring-1 ring-inset ring-[var(--line)]'
        : 'text-[var(--ink-dim)] hover:bg-[var(--surface-2)]/60 hover:text-[var(--ink)]',
    ].join(' ');

  const NavNumber = ({ active, children }: { active: boolean; children: string }) => (
    <span className={`font-mono ${active ? 'text-[var(--accent)]' : 'text-[var(--ink-faint)]'}`}>{children}</span>
  );

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-[var(--line)] bg-[var(--surface)] px-4 py-5 lg:flex">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface-2)]">
          {/* live signal — observatory mark */}
          <span className="h-2 w-2 rounded-full bg-[var(--accent)] dot-glow text-[var(--accent)]" />
        </div>
        <div className="leading-tight">
          <div className="font-mono text-sm font-semibold tracking-tight text-[var(--ink)]">Aletheia</div>
          <div className="text-[11px] text-[var(--ink-faint)]">Relay Observatory</div>
        </div>
      </div>

      <div className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        监控
      </div>
      <nav className="space-y-1">
        <NavLink to="/" className={navLink} end>
          {({ isActive }) => (<><NavNumber active={isActive}>01</NavNumber>看板</>)}
        </NavLink>
        <NavLink to="/manage" className={navLink}>
          {({ isActive }) => (<><NavNumber active={isActive}>02</NavNumber>站点管理</>)}
        </NavLink>
      </nav>

      <div className="mt-auto rounded-md border border-[var(--line)] bg-[var(--surface-2)]/40 p-3">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)] dot-glow text-[var(--ok)]" />
          <div className="text-xs font-medium text-[var(--ink-dim)]">会话活跃</div>
        </div>
        <div className="mt-1 font-mono text-[11px] text-[var(--ink-faint)]">已认证</div>
        <button
          onClick={onLogout}
          className="mt-3 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--ink-dim)] transition hover:border-[var(--bad)]/40 hover:bg-[var(--bad)]/5 hover:text-[var(--bad)]"
        >
          退出登录
        </button>
      </div>
    </aside>
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
      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--bg)]/85 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)] dot-glow text-[var(--accent)]" />
              <span className="font-mono text-sm font-semibold text-[var(--ink)]">Aletheia</span>
            </div>
            <button onClick={handleLogout} className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink-dim)]">
              退出
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
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
