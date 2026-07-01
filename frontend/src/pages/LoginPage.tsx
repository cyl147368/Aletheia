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
    <main className="flex min-h-screen w-full items-center justify-center px-6 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl text-lg font-black text-white" style={{ background: 'linear-gradient(135deg, var(--accent), var(--info))', boxShadow: '0 0 30px var(--accent-glow)' }}>
            A
          </div>
          <div className="eyebrow">Aletheia</div>
          <h1 className="text-[28px] font-black text-[var(--ink)] mt-2 tracking-tight">进入观测台</h1>
          <p className="mt-2 text-[13px] text-[var(--ink-dim)]">查看中转站可用状态和模型检测结果。</p>
        </div>

        <div className="panel p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <p className="rounded-lg border px-3 py-2 text-[12px] text-[var(--bad-light)]" style={{ borderColor: 'var(--bad)', background: 'var(--bad-dim)' }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary h-10 w-full">
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
