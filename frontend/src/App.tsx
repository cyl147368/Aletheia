import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import StationDetailPage from './pages/StationDetailPage';
import ProbeResultPage from './pages/ProbeResultPage';
import ManagePage from './pages/ManagePage';
import { listStations, getOverview, type Station, type Overview } from './api';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('aletheia_token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/* ── Theme hook ── */
function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('aletheia-theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('aletheia-theme', theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}

/* ── Status helpers ── */
const statusConfig: Record<string, { dot: string; badge: string; label: string }> = {
  ok:       { dot: 'bg-[var(--ok-light)]',   badge: 'bg-[var(--ok-dim)] text-[var(--ok-light)]',     label: '正常' },
  degraded: { dot: 'bg-[var(--warn-light)]', badge: 'bg-[var(--warn-dim)] text-[var(--warn-light)]', label: '部分故障' },
  down:     { dot: 'bg-[var(--bad-light)]',  badge: 'bg-[var(--bad-dim)] text-[var(--bad-light)]',   label: '宕机' },
  unknown:  { dot: 'bg-[var(--ink-faint)]',  badge: 'bg-[var(--surface-2)] text-[var(--ink-dim)]',   label: '未探测' },
};

/* ── Sidebar ── */
function Sidebar({ onLogout, onToggleTheme, theme }: { onLogout: () => void; onToggleTheme: () => void; theme: string }) {
  const [stations, setStations] = useState<Station[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const match = location.pathname.match(/^\/stations\/(\d+)/);
  const activeId = match ? Number(match[1]) : null;

  const fetchSidebar = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([listStations(), getOverview()]);
      setStations(s);
      setOverview(o);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchSidebar(); }, [fetchSidebar]);

  const refresh = useCallback(() => { fetchSidebar(); }, [fetchSidebar]);

  return (
    <aside className="flex flex-col flex-shrink-0 border-r" style={{ width: 280, background: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}>
      {/* Brand */}
      <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>A</div>
          <span className="font-bold text-[15px] text-[var(--ink)]">Aletheia</span>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-1">
          {[
            { val: overview?.total ?? 0, label: 'Total', color: '' },
            { val: overview?.ok ?? 0, label: 'OK', color: 'text-[var(--ok-light)]' },
            { val: overview?.degraded ?? 0, label: 'Warn', color: 'text-[var(--warn-light)]' },
            { val: overview?.down ?? 0, label: 'Down', color: 'text-[var(--bad-light)]' },
          ].map((s) => (
            <div key={s.label} className="text-center py-2 px-1 rounded-lg" style={{ background: 'var(--surface)' }}>
              <div className={`text-sm font-bold tabular-nums ${s.color}`}>{s.val}</div>
              <div className="text-[9px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: 'var(--ink-faint)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Nav links */}
      <div className="px-2 pt-3 pb-1">
        <NavLink to="/" end className={({ isActive }) =>
          `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] mb-0.5 transition ${isActive ? 'bg-[var(--surface-2)] text-[var(--ink)] font-medium' : 'text-[var(--ink-faint)] hover:text-[var(--ink-dim)]'}`
        }>
          <span className="w-1 h-1 rounded-full bg-current" /> 看板
        </NavLink>
        <NavLink to="/manage" className={({ isActive }) =>
          `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] mb-0.5 transition ${isActive ? 'bg-[var(--surface-2)] text-[var(--ink)] font-medium' : 'text-[var(--ink-faint)] hover:text-[var(--ink-dim)]'}`
        }>
          <span className="w-1 h-1 rounded-full bg-current" /> 站点管理
        </NavLink>
      </div>

      {/* Station list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>
          Stations
        </div>
        {stations.map((station) => {
          const config = statusConfig[station.status] ?? statusConfig.unknown;
          const isActive = activeId === station.id;

          return (
            <button
              key={station.id}
              type="button"
              onClick={() => navigate(`/stations/${station.id}`)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-left transition mb-0.5 ${isActive ? 'bg-[var(--surface-2)]' : 'hover:bg-[var(--surface)]'}`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 dot-glow ${config.dot}`} style={{ color: 'currentColor' }} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate text-[var(--ink)]">{station.name}</div>
                <div className="text-[10px] truncate font-mono" style={{ color: 'var(--ink-faint)' }}>{station.base_url.replace(/^https?:\/\//, '')}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[11px] font-semibold tabular-nums text-[var(--ink-dim)]">{station.api_key_masked.slice(0, 6)}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok-light)]" />
          已认证
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={refresh}
            className="w-7 h-7 rounded-md border flex items-center justify-center text-xs transition hover:border-[var(--accent)] hover:text-[var(--accent-light)]"
            style={{ borderColor: 'var(--line-soft)', color: 'var(--ink-faint)' }}
            title="刷新"
          >⟳</button>
          <button
            onClick={onToggleTheme}
            className="w-7 h-7 rounded-md border flex items-center justify-center text-xs transition hover:border-[var(--accent)] hover:text-[var(--accent-light)]"
            style={{ borderColor: 'var(--line-soft)', color: 'var(--ink-faint)' }}
            title="切换主题"
          >{theme === 'dark' ? '☀' : '☾'}</button>
          <button
            onClick={onLogout}
            className="w-7 h-7 rounded-md border flex items-center justify-center text-xs transition hover:border-[var(--bad-light)] hover:text-[var(--bad-light)]"
            style={{ borderColor: 'var(--line-soft)', color: 'var(--ink-faint)' }}
            title="退出登录"
          >⏻</button>
        </div>
      </div>
    </aside>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('aletheia_token'));
  const { theme, toggle: toggleTheme } = useTheme();

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
      <div className="flex min-h-screen">
        <Sidebar onLogout={handleLogout} onToggleTheme={toggleTheme} theme={theme} />
        <main className="flex-1 min-w-0 overflow-y-auto">
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
