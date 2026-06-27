import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { triggerProbe, type ModelResult, type Overview, type ProbeResult, type Station } from '../api';
import {
  attemptRole,
  capabilityFlagLabel,
  degradationFlagLabel,
  diagnosticStatusLabel,
  endpointLabel,
  formatJson,
  formatRequestRecord,
  parseAttempts,
  parseCapabilityFlags,
  parseFlags,
  parseRequests,
} from '../utils/probeDisplay';

const statusConfig = {
  ok: { label: '正常', dot: 'bg-[var(--ok)]', text: 'text-[var(--ok)]', pill: 'border-[var(--ok)]/30 bg-[var(--ok)]/10 text-[var(--ok)]' },
  degraded: { label: '部分故障', dot: 'bg-[var(--warn)]', text: 'text-[var(--warn)]', pill: 'border-[var(--warn)]/30 bg-[var(--warn)]/10 text-[var(--warn)]' },
  down: { label: '宕机', dot: 'bg-[var(--bad)]', text: 'text-[var(--bad)]', pill: 'border-[var(--bad)]/30 bg-[var(--bad)]/10 text-[var(--bad)]' },
  unknown: { label: '未探测', dot: 'bg-[var(--ink-faint)]', text: 'text-[var(--ink-faint)]', pill: 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-dim)]' },
};

function AvailabilityPill({ available }: { available: boolean }) {
  return available ? (
    <span className="inline-flex min-w-16 justify-center rounded border border-[var(--ok)]/30 bg-[var(--ok)]/10 px-2 py-1 text-xs font-medium text-[var(--ok)]">
      可用
    </span>
  ) : (
    <span className="inline-flex min-w-16 justify-center rounded border border-[var(--bad)]/30 bg-[var(--bad)]/10 px-2 py-1 text-xs font-medium text-[var(--bad)]">
      不可用
    </span>
  );
}

function ModelRow({ model }: { model: ModelResult }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(model.request_body || model.response_body);
  const attempts = parseAttempts(model.response_body);
  const requests = parseRequests(model.request_body);
  const flags = parseFlags(model.degradation_flags);
  const capabilities = parseCapabilityFlags(model.degradation_flags);
  const diagnosticStatus = diagnosticStatusLabel(flags, model.authenticity_score, model.available, attempts);

  return (
    <>
      <tr className="border-t border-[var(--line-soft)] align-top hover:bg-[var(--surface-2)]/40">
        <td className="px-4 py-3 font-mono text-xs text-[var(--ink)]">{model.model_id}</td>
        <td className="px-4 py-3">
          <AvailabilityPill available={model.available} />
        </td>
        <td className="px-4 py-3 font-mono text-xs text-[var(--ink-dim)]">{model.available ? `${model.ttft_ms}ms` : '-'}</td>
        <td className="max-w-64 px-4 py-3 text-xs text-[var(--ink-faint)]">
          <div className="truncate" title={model.response_preview || ''}>{model.response_preview || '-'}</div>
        </td>
        <td className="max-w-64 px-4 py-3 text-xs text-[var(--bad)]/80">
          <div className="truncate" title={model.error_message || ''}>{model.error_message || '-'}</div>
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
        <td className="px-4 py-3 text-right">
          {hasDetail && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--ink-dim)] transition hover:border-[var(--line)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            >
              {expanded ? '收起' : '详情'}
            </button>
          )}
        </td>
      </tr>
      {expanded && hasDetail && (
        <tr className="border-t border-[var(--line-soft)] bg-[var(--surface-2)]/30">
          <td colSpan={7} className="px-4 py-4">
            <div className="space-y-3">
              {attempts.length > 0 ? attempts.map((attempt, index) => {
                const req = requests[index];
                return (
                  <div key={`${attempt.endpoint}-${index}`} className="rounded border border-[var(--line)] bg-[var(--surface)]">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--ink)]">
                          {endpointLabel[attempt.endpoint] ?? attempt.endpoint}
                        </span>
                        <span className="inline-flex rounded border border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-dim)]">
                          {attemptRole(index, attempts)}
                        </span>
                        <span
                          className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                            attempt.available
                              ? 'border-[var(--ok)]/30 bg-[var(--ok)]/10 text-[var(--ok)]'
                              : 'border-[var(--bad)]/30 bg-[var(--bad)]/10 text-[var(--bad)]'
                          }`}
                        >
                          {attempt.available ? `TTFT ${attempt.ttft_ms}ms` : '失败'}
                        </span>
                      </div>
                      <code className="font-mono text-[11px] text-[var(--ink-faint)]">{attempt.url}</code>
                    </div>
                    {attempt.error_message && (
                      <p className="border-b border-[var(--line)] px-3 py-2 text-xs text-[var(--bad)]/80">
                        {attempt.error_message}
                      </p>
                    )}
                    <div className="grid gap-3 p-3 lg:grid-cols-2">
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">请求</div>
                        <pre className="max-h-40 overflow-auto rounded border border-[var(--line)] bg-[var(--bg)] p-2 text-[11px] leading-5 text-[var(--ink-dim)]">
                          {formatRequestRecord(req)}
                        </pre>
                      </div>
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">响应</div>
                        <pre className="max-h-40 overflow-auto rounded border border-[var(--line)] bg-[var(--bg)] p-2 text-[11px] leading-5 text-[var(--ink-dim)]">
                          {formatJson(attempt.response_body)}
                        </pre>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 text-xs font-semibold text-[var(--ink-dim)]">请求体</div>
                    <pre className="max-h-48 overflow-auto rounded border border-[var(--line)] bg-[var(--bg)] p-3 text-xs leading-5 text-[var(--ink-dim)]">
                      {formatJson(model.request_body)}
                    </pre>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-semibold text-[var(--ink-dim)]">响应体</div>
                    <pre className="max-h-48 overflow-auto rounded border border-[var(--line)] bg-[var(--bg)] p-3 text-xs leading-5 text-[var(--ink-dim)]">
                      {formatJson(model.response_body)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { getOverview, listStations } = await import('../api');
      const [ov, st] = await Promise.all([getOverview(), listStations()]);
      setOverview(ov);
      setStations(st);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleProbe = async (id: number) => {
    setProbing((p) => new Set(p).add(id));
    try {
      await triggerProbe(id);
      await fetchData();
      if (expandedId === id) {
        const { getLatestResult } = await import('../api');
        setProbeResult(await getLatestResult(id));
      }
    } finally {
      setProbing((p) => {
        const next = new Set(p);
        next.delete(id);
        return next;
      });
    }
  };

  const toggleExpand = async (station: Station) => {
    if (expandedId === station.id) {
      setExpandedId(null);
      setProbeResult(null);
      return;
    }
    setExpandedId(station.id);
    setProbeResult(null);
    const { getLatestResult } = await import('../api');
    setProbeResult(await getLatestResult(station.id));
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-[var(--ink-faint)]">加载中...</div>;
  }

  const metrics = [
    { label: '总站点', value: overview?.total ?? 0, tone: 'text-[var(--ink)]' },
    { label: '正常', value: overview?.ok ?? 0, tone: 'text-[var(--ok)]' },
    { label: '部分故障', value: overview?.degraded ?? 0, tone: 'text-[var(--warn)]' },
    { label: '宕机', value: overview?.down ?? 0, tone: 'text-[var(--bad)]' },
    { label: '未探测', value: overview?.unknown ?? 0, tone: 'text-[var(--ink-dim)]' },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--ink-faint)]">Overview</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink)]">看板</h1>
          <p className="mt-1 text-sm text-[var(--ink-dim)]">集中查看站点状态、最近探测和模型级结果。</p>
        </div>
        <button
          onClick={fetchData}
          className="h-10 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--ink-dim)] transition hover:border-[var(--line)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        >
          刷新
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((item) => (
          <div key={item.label} className="panel rounded-lg p-4">
            <div className="text-xs font-medium text-[var(--ink-faint)]">{item.label}</div>
            <div className={`mt-3 font-mono text-3xl font-semibold tabular-nums ${item.tone}`}>{item.value}</div>
          </div>
        ))}
      </section>

      <section className="panel rounded-lg overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] dot-glow text-[var(--accent)]" />
            站点
          </h2>
          <Link to="/manage" className="text-sm font-medium text-[var(--ink-dim)] transition hover:text-[var(--accent)]">
            管理站点 →
          </Link>
        </div>

        {stations.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-[var(--ink-faint)]">
            还没有添加中转站，前往 <Link to="/manage" className="font-medium text-[var(--accent)]">站点管理</Link> 添加。
          </div>
        ) : (
          <div className="divide-y divide-[var(--line-soft)]">
            {stations.map((station) => {
              const config = statusConfig[station.status];
              const isExpanded = expandedId === station.id;
              const isProbing = probing.has(station.id);

              return (
                <article key={station.id}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(station)}
                    className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-[var(--surface-2)]/40 lg:grid-cols-[minmax(180px,1.3fr)_minmax(240px,1.7fr)_150px_170px_32px] lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${config.dot} dot-glow text-current ${config.text}`} />
                        <span className="truncate font-medium text-[var(--ink)]">{station.name}</span>
                      </div>
                      <span className={`mt-2 inline-flex rounded border px-2 py-0.5 text-xs font-medium ${config.pill}`}>{config.label}</span>
                    </div>
                    <div className="min-w-0 font-mono text-xs text-[var(--ink-dim)]">
                      <div className="truncate">{station.base_url}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[var(--ink-faint)]">
                        <span className="truncate">{station.api_key_masked}</span>
                        {station.official_url && (
                          <a
                            href={station.official_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="font-sans text-[11px] font-medium text-[var(--accent)] transition hover:brightness-125"
                          >
                            官网
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-[var(--ink-dim)]">
                      {station.schedule_enabled ? `每 ${station.schedule_interval_hours}h` : '定时关闭'}
                    </div>
                    <div className="text-xs text-[var(--ink-dim)]">
                      {station.last_probe_at ? new Date(station.last_probe_at).toLocaleString('zh-CN') : '暂无记录'}
                    </div>
                    <div className="text-right text-lg leading-none text-[var(--ink-faint)]">{isExpanded ? '−' : '+'}</div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[var(--line-soft)] bg-[var(--surface-2)]/30 px-4 py-4">
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-[var(--ink)]">最近探测结果</h3>
                          <p className="mt-1 text-xs text-[var(--ink-dim)]">展开模型请求、响应和错误信息。</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleProbe(station.id); }}
                          disabled={isProbing}
                          className="h-9 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[#04110f] transition hover:brightness-110 disabled:opacity-50"
                        >
                          {isProbing ? '探测中...' : '立即探测'}
                        </button>
                      </div>

                      {probeResult?.batch ? (
                        <div className="space-y-4">
                          <div className="grid gap-3 sm:grid-cols-4">
                            {[
                              { label: '总模型', value: probeResult.batch.total_models },
                              { label: '可用', value: probeResult.batch.available_models, tone: 'text-[var(--ok)]' },
                              { label: '不可用', value: probeResult.batch.unavailable_models, tone: 'text-[var(--bad)]' },
                              { label: '耗时', value: `${probeResult.batch.duration_ms}ms` },
                            ].map((item) => (
                              <div key={item.label} className="panel rounded-lg p-3">
                                <div className={`font-mono text-lg font-semibold tabular-nums ${item.tone ?? 'text-[var(--ink)]'}`}>{item.value}</div>
                                <div className="mt-1 text-xs text-[var(--ink-faint)]">{item.label}</div>
                              </div>
                            ))}
                          </div>

                          {probeResult.models.length > 0 && (
                            <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--surface)]">
                              <table className="w-full min-w-[980px] text-left">
                                <thead className="bg-[var(--surface-2)]/50 text-xs font-semibold text-[var(--ink-faint)]">
                                  <tr>
                                    <th className="px-4 py-3">模型</th>
                                    <th className="px-4 py-3">状态</th>
                                    <th className="px-4 py-3">TTFT</th>
                                    <th className="px-4 py-3">响应</th>
                                    <th className="px-4 py-3">错误</th>
                                    <th className="px-4 py-3">套壳/降智/能力</th>
                                    <th className="px-4 py-3 text-right">详情</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {probeResult.models.map((model) => <ModelRow key={model.id} model={model} />)}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-10 text-center text-sm text-[var(--ink-faint)]">
                          还没有探测记录，点击“立即探测”开始。
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
