import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getStation, triggerProbe, getLatestResult, type Station, type ProbeResult } from '../api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function StationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const stationId = Number(id);
  const [station, setStation] = useState<Station | null>(null);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);

  const fetchData = useCallback(async () => {
    const [s, r] = await Promise.all([getStation(stationId), getLatestResult(stationId)]);
    setStation(s);
    setResult(r);
  }, [stationId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleProbe = async () => {
    setProbing(true);
    try {
      await triggerProbe(stationId);
      await fetchData();
    } finally {
      setProbing(false);
    }
  };

  if (!station) {
    return <div className="text-center py-12 text-slate-400">加载中...</div>;
  }

  const statusText: Record<string, string> = { ok: '正常', degraded: '部分故障', down: '宕机', unknown: '未探测' };
  const statusColor: Record<string, string> = { ok: 'text-green-600', degraded: 'text-yellow-600', down: 'text-red-600', unknown: 'text-slate-400' };

  const ttftData = result?.models?.filter((m: { available: boolean; model_id: string; ttft_ms: number }) => m.available).map(m => ({
    model: m.model_id.split('/').pop() || m.model_id,
    ttft: m.ttft_ms,
  })) ?? [];

  const latestModels = result?.models ?? [];
  const hasModels = latestModels.length > 0;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6 text-sm text-slate-400">
        <Link to="/" className="hover:text-blue-600">看板</Link>
        <span>/</span>
        <span className="text-slate-700">{station.name}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{station.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            <span className={statusColor[station.status]}>{statusText[station.status]}</span>
            <span className="mx-2">·</span>
            <code className="text-xs">{station.base_url}</code>
            <span className="mx-2">·</span>
            定时：{station.schedule_enabled ? `每${station.schedule_interval_hours}h` : '关闭'}
          </p>
        </div>
        <button
          onClick={handleProbe}
          disabled={probing}
          className="bg-blue-600 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {probing ? '探测中...' : '立即探测'}
        </button>
      </div>

      {result?.batch && (
        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { label: '模型总数', value: result.batch.total_models },
            { label: '可用', value: result.batch.available_models, cls: 'text-green-600' },
            { label: '不可用', value: result.batch.unavailable_models, cls: 'text-red-600' },
            { label: '耗时', value: `${result.batch.duration_ms}ms` },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-xl p-4 shadow text-center">
              <div className={`text-2xl font-bold ${c.cls ?? ''}`}>{c.value}</div>
              <div className="text-xs mt-1 text-slate-500">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {hasModels && (
        <>
          {ttftData.length > 1 && (
            <div className="bg-white rounded-xl p-6 shadow mb-6">
              <h2 className="text-lg font-semibold mb-4 text-slate-800">TTFT 分布 (ms)</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={ttftData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="model" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="ttft" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-left">
                  <th className="px-4 py-3 font-medium text-slate-500">模型</th>
                  <th className="px-4 py-3 font-medium text-slate-500">状态</th>
                  <th className="px-4 py-3 font-medium text-slate-500">TTFT</th>
                  <th className="px-4 py-3 font-medium text-slate-500">响应预览</th>
                  <th className="px-4 py-3 font-medium text-slate-500">错误</th>
                </tr>
              </thead>
              <tbody>
                {latestModels.map((m) => (
                  <tr key={m.id} className="border-b hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{m.model_id}</td>
                    <td className="px-4 py-3">
                      {m.available ? (
                        <span className="text-green-600 text-xs font-medium">✅ 可用</span>
                      ) : (
                        <span className="text-red-500 text-xs font-medium">❌ 不可用</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{m.available ? `${m.ttft_ms}ms` : '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-48 truncate" title={m.response_preview ?? ''}>
                      {m.response_preview || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-red-400 max-w-48 truncate" title={m.error_message ?? ''}>
                      {m.error_message || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!result?.batch && (
        <div className="text-center py-12 text-slate-400 bg-white rounded-xl">
          还没有探测记录，点击上方按钮进行首次探测
        </div>
      )}
    </div>
  );
}