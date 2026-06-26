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
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[1fr_420px]">
        <section className="hidden lg:block">
          <div className="mb-8 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-lg font-semibold text-white">
            A
          </div>
          <h1 className="max-w-xl text-4xl font-semibold tracking-normal text-slate-950">
            Aletheia
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
            面向中转站的模型可用性观测台，集中查看请求端点、响应状态和首 token 延迟。
          </p>
          <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3">
            {['Endpoint probe', 'Model health', 'Latency trace'].map((item) => (
              <div key={item} className="border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{item}</div>
                <div className="mt-3 h-1.5 w-full bg-slate-100">
                  <div className="h-full w-2/3 bg-slate-900" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-7">
            <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-sm font-semibold text-white lg:hidden">
              A
            </div>
            <h2 className="text-xl font-semibold text-slate-950">管理员登录</h2>
            <p className="mt-2 text-sm text-slate-500">进入 Aletheia 控制台</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm">
              <span className="mb-2 block font-medium text-slate-700">密码</span>
              <input
                type="password"
                placeholder="输入管理员密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
                autoFocus
              />
            </label>

            {error && (
              <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="h-11 w-full bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
