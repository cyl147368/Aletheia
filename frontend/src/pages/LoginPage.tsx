import { useState, type FormEvent } from 'react';
import { login } from '../api';

export default function LoginPage({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const token = await login(password);
      onLogin(token);
    } catch {
      setError('密码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center px-6" style={{ background: 'var(--bg)' }}>
      {/* Background decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[300px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full opacity-60" style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.08) 0%, transparent 70%)' }} />
      </div>

      <div className="relative z-10 w-full max-w-[400px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg mb-4" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>A</div>
          <h1 className="text-xl font-bold text-[var(--ink)]">Aletheia</h1>
          <p className="text-sm mt-1.5 text-[var(--ink-faint)]">LLM 中转站可用性观测台</p>
        </div>

        {/* Login card */}
        <div className="panel p-6">
          <div className="mb-5">
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">管理员登录</h2>
            <p className="mt-1 text-[12px] text-[var(--ink-faint)]">输入密码进入控制台</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="block text-[11px] font-semibold mb-1.5 text-[var(--ink-dim)]">密码</span>
              <input
                type="password"
                placeholder="输入管理员密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-base h-10 w-full text-sm"
                autoFocus
              />
            </label>

            {error && (
              <p className="rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: 'var(--bad-light)', background: 'var(--bad-dim)', color: 'var(--bad-light)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="h-10 w-full rounded-lg text-[13px] font-semibold transition hover:brightness-110 disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none' }}
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
