import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getBatchDetail, getStation, type ProbeResult, type Station } from '../api';

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
    return <div className="py-12 text-center text-sm text-slate-400">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-slate-400">
        <Link to="/" className="hover:text-slate-700">看板</Link>
        <span>/</span>
        <Link to={`/stations/${stationId}`} className="hover:text-slate-700">{station.name}</Link>
        <span>/</span>
        <span className="text-slate-700">探测 #{result.batch.id}</span>
      </nav>

      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Probe result</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">探测结果</h1>
        <p className="mt-2 text-sm text-slate-500">
          {new Date(result.batch.probed_at).toLocaleString('zh-CN')}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '总模型', value: result.batch.total_models },
          { label: '可用', value: result.batch.available_models, tone: 'text-emerald-700' },
          { label: '不可用', value: result.batch.unavailable_models, tone: 'text-rose-700' },
          { label: '耗时', value: `${result.batch.duration_ms}ms` },
        ].map((item) => (
          <div key={item.label} className="border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">{item.label}</div>
            <div className={`mt-3 text-2xl font-semibold ${item.tone ?? 'text-slate-950'}`}>{item.value}</div>
          </div>
        ))}
      </section>

      <section className="overflow-x-auto border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-950">模型明细</h2>
        </div>
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">模型</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">TTFT</th>
              <th className="px-4 py-3">响应预览</th>
              <th className="px-4 py-3">错误</th>
            </tr>
          </thead>
          <tbody>
            {result.models.map((model) => (
              <tr key={model.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-800">{model.model_id}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex min-w-16 justify-center border px-2 py-1 text-xs font-medium ${model.available ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                    {model.available ? '可用' : '不可用'}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{model.available ? `${model.ttft_ms}ms` : '-'}</td>
                <td className="max-w-56 px-4 py-3 text-xs text-slate-500">
                  <div className="truncate" title={model.response_preview ?? ''}>{model.response_preview || '-'}</div>
                </td>
                <td className="max-w-56 px-4 py-3 text-xs text-rose-500">
                  <div className="truncate" title={model.error_message ?? ''}>{model.error_message || '-'}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
