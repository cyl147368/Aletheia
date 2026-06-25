import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { listStations, getOverview, triggerProbe, type Station, type Overview } from '../api';

const statusLabel: Record<string, string> = {
  ok: '正常',
  degraded: '部分故障',
  down: '宕机',
  unknown: '未探测',
};

const statusColor: Record<string, string> = {
  ok: 'bg-green-500',
  degraded: 'bg-yellow-500',
  down: 'bg-red-500',
  unknown: 'bg-slate-300',
};

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [probing, setProbing] = useState<Set<number>>(new Set());

  const fetchData = useCallback(async () => {
    const [ov, st] = await Promise.all([getOverview(), listStations()]);
    setOverview(ov);
    setStations(st);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleProbe = async (id: number) => {
    setProbing((p) => new Set(p).add(id));
    try {
      await triggerProbe(id);
      await fetchData();
    } finally {
      setProbing((p) => {
        const next = new Set(p);
        next.delete(id);
        return next;
      });
    }
  };

  const cards = [
    { label: '总计', value: overview?.total ?? 0, bg: 'bg-slate-100' },
    { label: '正常', value: overview?.ok ?? 0, bg: 'bg-green-50 text-green-700' },
    { label: '部分故障', value: overview?.degraded ?? 0, bg: 'bg-yellow-50 text-yellow-700' },
    { label: '宕机', value: overview?.down ?? 0, bg: 'bg-red-50 text-red-700' },
    { label: '未探测', value: overview?.unknown ?? 0, bg: 'bg-slate-100' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">看板</h1>
        <button
          onClick={fetchData}
          className="text-sm text-blue-600 hover:text-blue-800 transition"
        >
          刷新
        </button>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-8">
        {cards.map((c) => (
          <div key={c.label} className={`${c.bg} rounded-xl p-4 text-center`}>
            <div className="text-2xl font-bold">{c.value}</div>
            <div className="text-xs mt-1 opacity-70">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b text-left">
              <th className="px-4 py-3 font-medium text-slate-500">状态</th>
              <th className="px-4 py-3 font-medium text-slate-500">名称</th>
              <th className="px-4 py-3 font-medium text-slate-500">地址</th>
              <th className="px-4 py-3 font-medium text-slate-500">密钥</th>
              <th className="px-4 py-3 font-medium text-slate-500">定时</th>
              <th className="px-4 py-3 font-medium text-slate-500">最近探测</th>
              <th className="px-4 py-3 font-medium text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((s) => (
              <tr key={s.id} className="border-b hover:bg-slate-50 transition">
                <td className="px-4 py-3">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusColor[s.status]}`} title={statusLabel[s.status]} />
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link to={`/stations/${s.id}`} className="hover:text-blue-600 transition">{s.name}</Link>
                </td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{s.base_url}</td>
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{s.api_key_masked}</td>
                <td className="px-4 py-3">
                  {s.schedule_enabled ? (
                    <span className="text-xs text-green-600">每{s.schedule_interval_hours}h</span>
                  ) : (
                    <span className="text-xs text-slate-400">关闭</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {s.last_probe_at
                    ? new Date(s.last_probe_at).toLocaleString('zh-CN')
                    : '—'
                  }
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button
                    onClick={() => handleProbe(s.id)}
                    disabled={probing.has(s.id)}
                    className="text-xs bg-blue-600 text-white rounded px-2.5 py-1 hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {probing.has(s.id) ? '探测中...' : '探测'}
                  </button>
                  <Link
                    to={`/stations/${s.id}`}
                    className="text-xs bg-slate-100 text-slate-600 rounded px-2.5 py-1 hover:bg-slate-200 transition"
                  >
                    详情
                  </Link>
                </td>
              </tr>
            ))}
            {stations.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-400">
                  还没有添加中转站，前往
                  <Link to="/manage" className="text-blue-600 mx-1">管理页面</Link>
                  添加
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}