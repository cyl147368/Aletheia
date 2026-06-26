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
  const navItem = ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition',
      isActive
        ? 'bg-slate-900 text-white shadow-sm'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
    ].join(' ');

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-200 bg-white/95 px-4 py-5 shadow-sm backdrop-blur lg:flex lg:flex-col">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white">
          A
        </div>
        <div>
          <div className="text-base font-semibold tracking-tight text-slate-950">Aletheia</div>
          <div className="text-xs text-slate-500">Relay Observatory</div>
        </div>
      </div>

      <div className="space-y-1">
        <NavLink to="/" className={navItem} end>
          <span className="text-base">⌁</span>
          看板
        </NavLink>
        <NavLink to="/manage" className={navItem}>
          <span className="text-base">＋</span>
          站点管理
        </NavLink>
      </div>

      <div className="mt-auto rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-medium text-slate-500">当前会话</div>
        <div className="mt-1 text-sm font-semibold text-slate-900">已认证</div>
        <button
          onClick={onLogout}
          className="mt-3 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
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
      <div className="min-h-screen bg-slate-50 lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/85 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-slate-950">Aletheia</div>
            <button onClick={handleLogout} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600">
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
