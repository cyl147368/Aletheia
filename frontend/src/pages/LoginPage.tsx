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
    <main className="login-shell">
      <section className="panel login-panel">
        <div className="login-intro">
          <div className="login-logo">A</div>
          <div className="eyebrow">Aletheia</div>
          <h1 className="page-title">进入观测台</h1>
          <p className="page-subtitle">查看中转站可用状态和模型检测结果。</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="block">
            <span className="mb-2 block text-[12px] font-bold text-[var(--ink-dim)]">管理员密码</span>
            <input
              type="password"
              placeholder="输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-base w-full"
              autoFocus
            />
          </label>

          {error && (
            <p className="rounded-lg border px-3 py-2 text-[12px] text-[var(--bad-light)]" style={{ borderColor: 'var(--bad-light)', background: 'var(--bad-dim)' }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="button-primary h-10 w-full">
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </section>
    </main>
  );
}
