import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBatchDetail, getStation, type Station, type ProbeResult } from '../api';

export default function ProbeResultPage() {
  const { id, batchId } = useParams<{ id: string; batchId: string }>();
  const stationId = Number(id);
  const [station, setStation] = useState<Station | null>(null);
  const [result, setResult] = useState<ProbeResult | null>(null);

  useEffect(() => {
    Promise.all([
      getStation(stationId),
      getBatchDetail(stationId, Number(batchId)),
    ]).then(([s, r]) => {
      setStation(s);
      setResult(r);
    });
  }, [stationId, batchId]);

  if (!station || !result?.batch) {
    return <div className="text-center py-12 text-slate-400">加载中...</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-6 text-sm text-slate-400">
        <Link to="/" className="hover:text-blue-600">看板</Link>
        <span>/</span>
        <Link to={`/stations/${stationId}`} className="hover:text-blue-600">{station.name}</Link>
        <span>/</span>
        <span className="text-slate-700">探测 #{result.batch.id}</span>
      </div>

      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">探测结果</h1>
        <p className="text-sm text-slate-500 mt-1">
          时间：{new Date(result.batch.probed_at).toLocaleString('zh-CN')}
          <span className="mx-2">·</span>
          总模型：{result.batch.total_models}
          <span className="mx-2">·</span>
          可用：{result.batch.available_models}
          <span className="mx-2">·</span>
          不可用：{result.batch.unavailable_models}
          <span className="mx-2">·</span>
          耗时：{result.batch.duration_ms}ms
        </p>
      </div>

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
            {result.models.map((m: { id: number; model_id: string; available: boolean; ttft_ms: number; response_preview: string | null; error_message: string | null }) => (
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
    </div>
  );
}