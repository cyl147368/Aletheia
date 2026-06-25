import { useState } from 'react';
import { login } from '../api';

export default function LoginPage({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
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
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="bg-white rounded-xl shadow-2xl p-10 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-2 text-slate-900">Aletheia</h1>
        <p className="text-sm text-slate-500 text-center mb-6">中转站模型可用性探测</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            placeholder="输入管理员密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-slate-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}