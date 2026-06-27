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
    <main className="grid min-h-screen w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 py-10 mx-auto lg:grid-cols-[1fr_420px]">
      {/* ── Observatory thesis ── a live signal trace, not a stock hero ── */}
      <section className="hidden lg:block">
        <div className="mb-8 flex items-center gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)]">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] dot-glow text-[var(--accent)]" />
          </div>
          <div className="font-mono text-sm text-[var(--ink-faint)]">ALETHEIA · v1</div>
        </div>

        <h1 className="max-w-xl text-5xl font-semibold leading-[1.05] tracking-tight text-[var(--ink)]">
          揭开中转站的<br />
          <span className="text-[var(--accent)]">面纱</span>。
        </h1>
        <p className="mt-5 max-w-md text-base leading-7 text-[var(--ink-dim)]">
          面向 LLM 中转站的可用性观测台。持续探测，告诉你哪些模型真正可用、响应有多快、是不是套壳冒充。
        </p>

        {/* signal trace — the signature element. Status-colored latency
            spikes read as a real monitoring readout, not decoration. */}
        <div className="mt-10 max-w-xl">
          <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            <span>live · relay signal</span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)] dot-glow text-[var(--ok)]" />
              streaming
            </span>
          </div>
          <svg viewBox="0 0 560 92" className="h-24 w-full" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="trace-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5eead4" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#5eead4" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* baseline grid */}
            {[23, 46, 69].map((y) => (
              <line key={y} x1="0" y1={y} x2="560" y2={y} stroke="#1c2230" strokeWidth="1" strokeDasharray="2 4" />
            ))}
            <path
              d="M0 69 L40 69 L40 38 L60 38 L60 69 L120 69 L120 22 L140 22 L140 69 L210 69 L210 50 L235 50 L235 69 L300 69 L300 12 L320 12 L320 69 L380 69 L380 44 L405 44 L405 69 L470 69 L470 30 L490 30 L490 69 L560 69"
              fill="url(#trace-fill)"
              stroke="#5eead4"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {/* failure spike */}
            <line x1="300" y1="69" x2="300" y2="12" stroke="#fb7185" strokeWidth="1.5" />
            <circle cx="300" cy="12" r="3" fill="#fb7185" />
          </svg>
          <div className="mt-2 flex items-center gap-5 font-mono text-[11px] text-[var(--ink-faint)]">
            <span><span className="text-[var(--ok)]">●</span> ok · 312ms</span>
            <span><span className="text-[var(--warn)]">●</span> degraded · 580ms</span>
            <span><span className="text-[var(--bad)]">●</span> down</span>
          </div>
        </div>
      </section>

      {/* ── Auth gate ── */}
      <section className="panel rounded-lg p-6 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)] sm:p-8">
        <div className="mb-7">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-2)] lg:hidden">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)] dot-glow text-[var(--accent)]" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--ink)]">管理员登录</h2>
          <p className="mt-2 text-sm text-[var(--ink-dim)]">进入 Aletheia 控制台</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-2 block font-medium text-[var(--ink-dim)]">密码</span>
            <input
              type="password"
              placeholder="输入管理员密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none transition focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/20"
              autoFocus
            />
          </label>

          {error && (
            <p className="rounded-md border border-[var(--bad)]/30 bg-[var(--bad)]/10 px-3 py-2 text-sm text-[var(--bad)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[#04110f] transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </section>
    </main>
  );
}
