import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getLatestResult, getStation, triggerProbe, type ProbeResult, type Station } from '../api';
import {
  capabilityFlagLabel,
  degradationFlagLabel,
  diagnosticStatusLabel,
  parseAttempts,
  parseCapabilityFlags,
  parseFlags,
} from '../utils/probeDisplay';

const statusText: Record<string, string> = { ok: '正常', degraded: '部分故障', down: '宕机', unknown: '未探测' };
const statusClass: Record<string, string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  degraded: 'border-amber-200 bg-amber-50 text-amber-700',
  down: 'border-rose-200 bg-rose-50 text-rose-700',
  unknown: 'border-slate-200 bg-slate-50 text-slate-500',
};

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
    return <div className="py-12 text-center text-sm text-slate-400">加载中...</div>;
  }

  const ttftData = result?.models?.filter((model) => model.available).map((model) => ({
    model: model.model_id.split('/').pop() || model.model_id,
    ttft: model.ttft_ms,
  })) ?? [];
  const latestModels = result?.models ?? [];

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-slate-400">
        <Link to="/" className="hover:text-slate-700">看板</Link>
        <span>/</span>
        <span className="text-slate-700">{station.name}</span>
      </nav>

      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex border px-2.5 py-1 text-xs font-medium ${statusClass[station.status]}`}>
              {statusText[station.status]}
            </span>
            <span className="text-xs text-slate-400">
              {station.schedule_enabled ? `每 ${station.schedule_interval_hours}h 探测` : '定时关闭'}
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-950">{station.name}</h1>
          <p className="mt-2 truncate font-mono text-xs text-slate-500">{station.base_url}</p>
        </div>
        <button
          onClick={handleProbe}
          disabled={probing}
          className="h-10 bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {probing ? '探测中...' : '立即探测'}
        </button>
      </header>

      {result?.batch && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: '模型总数', value: result.batch.total_models },
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
      )}

      {ttftData.length > 1 && (
        <section className="border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">TTFT 分布</h2>
          </div>
          <div className="h-[320px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ttftData}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="model" tick={{ fontSize: 11 }} angle={-18} textAnchor="end" height={58} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="ttft" stroke="#0f172a" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {latestModels.length > 0 ? (
        <section className="overflow-x-auto border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">模型结果</h2>
          </div>
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">模型</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">TTFT</th>
                <th className="px-4 py-3">响应预览</th>
                <th className="px-4 py-3">错误</th>
                <th className="px-4 py-3">套壳/降智/能力</th>
              </tr>
            </thead>
            <tbody>
              {latestModels.map((model) => {
                const flags = parseFlags(model.degradation_flags);
                const attempts = parseAttempts(model.response_body);
                const capabilities = parseCapabilityFlags(model.degradation_flags);
                const diagnosticStatus = diagnosticStatusLabel(flags, model.authenticity_score, model.available, attempts);
                return (
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
                    <td className="px-4 py-3">
                      {flags.length > 0 || capabilities.length > 0 || diagnosticStatus ? (
                        <div className="flex flex-wrap gap-1">
                          {diagnosticStatus && (
                            <span className="inline-flex border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                              {diagnosticStatus}
                            </span>
                          )}
                          {flags.map((flag) => (
                            <span key={flag} className="inline-flex border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              {degradationFlagLabel[flag] ?? flag}
                            </span>
                          ))}
                          {capabilities.map((flag) => (
                            <span key={flag} className="inline-flex border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                              {capabilityFlagLabel[flag] ?? flag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : (
        <div className="border border-dashed border-slate-300 bg-white px-4 py-14 text-center text-sm text-slate-400">
          还没有探测记录，点击“立即探测”进行首次探测。
        </div>
      )}
    </div>
  );
}
