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
  ok: 'border-[var(--ok)]/30 bg-[var(--ok)]/10 text-[var(--ok)]',
  degraded: 'border-[var(--warn)]/30 bg-[var(--warn)]/10 text-[var(--warn)]',
  down: 'border-[var(--bad)]/30 bg-[var(--bad)]/10 text-[var(--bad)]',
  unknown: 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-dim)]',
};

// Dark chart tooltip
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 shadow-lg">
      <div className="font-mono text-[11px] text-[var(--ink-faint)]">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-[var(--accent)]">{payload[0].value}ms</div>
    </div>
  );
}

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
    return <div className="py-12 text-center text-sm text-[var(--ink-faint)]">加载中...</div>;
  }

  const ttftData = result?.models?.filter((model) => model.available).map((model) => ({
    model: model.model_id.split('/').pop() || model.model_id,
    ttft: model.ttft_ms,
  })) ?? [];
  const latestModels = result?.models ?? [];

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 font-mono text-xs text-[var(--ink-faint)]">
        <Link to="/" className="transition hover:text-[var(--accent)]">看板</Link>
        <span className="text-[var(--line)]">/</span>
        <span className="text-[var(--ink-dim)]">{station.name}</span>
      </nav>

      <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded border px-2.5 py-1 text-xs font-medium ${statusClass[station.status]}`}>
              {statusText[station.status]}
            </span>
            <span className="font-mono text-xs text-[var(--ink-faint)]">
              {station.schedule_enabled ? `每 ${station.schedule_interval_hours}h 探测` : '定时关闭'}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">{station.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="truncate font-mono text-xs text-[var(--ink-dim)]">{station.base_url}</p>
            {station.official_url && (
              <a
                href={station.official_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-[var(--accent)] transition hover:brightness-125"
              >
                官网
              </a>
            )}
          </div>
        </div>
        <button
          onClick={handleProbe}
          disabled={probing}
          className="h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[#04110f] transition hover:brightness-110 disabled:opacity-50"
        >
          {probing ? '探测中...' : '立即探测'}
        </button>
      </header>

      {result?.batch && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: '模型总数', value: result.batch.total_models },
            { label: '可用', value: result.batch.available_models, tone: 'text-[var(--ok)]' },
            { label: '不可用', value: result.batch.unavailable_models, tone: 'text-[var(--bad)]' },
            { label: '耗时', value: `${result.batch.duration_ms}ms` },
          ].map((item) => (
            <div key={item.label} className="panel rounded-lg p-4">
              <div className="text-xs font-medium text-[var(--ink-faint)]">{item.label}</div>
              <div className={`mt-3 font-mono text-2xl font-semibold tabular-nums ${item.tone ?? 'text-[var(--ink)]'}`}>{item.value}</div>
            </div>
          ))}
        </section>
      )}

      {ttftData.length > 1 && (
        <section className="panel rounded-lg">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] dot-glow text-[var(--accent)]" />
              TTFT 分布
            </h2>
          </div>
          <div className="h-[320px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ttftData}>
                <CartesianGrid stroke="#1c2230" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="model" tick={{ fontSize: 11, fill: '#5a6473' }} angle={-18} textAnchor="end" height={58} stroke="#1c2230" />
                <YAxis tick={{ fontSize: 11, fill: '#5a6473' }} stroke="#1c2230" />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#1c2230' }} />
                <Line type="monotone" dataKey="ttft" stroke="#5eead4" strokeWidth={2} dot={{ r: 3, fill: '#5eead4' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {latestModels.length > 0 ? (
        <section className="panel rounded-lg overflow-x-auto">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--ink)]">模型结果</h2>
          </div>
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-[var(--surface-2)]/50 text-xs font-semibold text-[var(--ink-faint)]">
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
                  <tr key={model.id} className="border-t border-[var(--line-soft)] transition hover:bg-[var(--surface-2)]/40">
                    <td className="px-4 py-3 font-mono text-xs text-[var(--ink)]">{model.model_id}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex min-w-16 justify-center rounded border px-2 py-1 text-xs font-medium ${model.available ? 'border-[var(--ok)]/30 bg-[var(--ok)]/10 text-[var(--ok)]' : 'border-[var(--bad)]/30 bg-[var(--bad)]/10 text-[var(--bad)]'}`}>
                        {model.available ? '可用' : '不可用'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--ink-dim)]">{model.available ? `${model.ttft_ms}ms` : '-'}</td>
                    <td className="max-w-56 px-4 py-3 text-xs text-[var(--ink-faint)]">
                      <div className="truncate" title={model.response_preview ?? ''}>{model.response_preview || '-'}</div>
                    </td>
                    <td className="max-w-56 px-4 py-3 text-xs text-[var(--bad)]/80">
                      <div className="truncate" title={model.error_message ?? ''}>{model.error_message || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      {flags.length > 0 || capabilities.length > 0 || diagnosticStatus ? (
                        <div className="flex flex-wrap gap-1">
                          {diagnosticStatus && (
                            <span className="inline-flex rounded border border-[var(--ok)]/30 bg-[var(--ok)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--ok)]">
                              {diagnosticStatus}
                            </span>
                          )}
                          {flags.map((flag) => (
                            <span key={flag} className="inline-flex rounded border border-[var(--warn)]/30 bg-[var(--warn)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--warn)]">
                              {degradationFlagLabel[flag] ?? flag}
                            </span>
                          ))}
                          {capabilities.map((flag) => (
                            <span key={flag} className="inline-flex rounded border border-[var(--info)]/30 bg-[var(--info)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--info)]">
                              {capabilityFlagLabel[flag] ?? flag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--ink-faint)]">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-14 text-center text-sm text-[var(--ink-faint)]">
          还没有探测记录，点击“立即探测”进行首次探测。
        </div>
      )}
    </div>
  );
}
