import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getBatchDetail, getStation, type ProbeResult, type Station } from '../api';
import { VeridropReportPanel } from '../components/VeridropReportPanel';
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
  parseVeridropReport,
} from '../utils/probeDisplay';

export default function ProbeResultPage() {
  const { id, batchId } = useParams<{ id: string; batchId: string }>();
  const stationId = Number(id);
  const [station, setStation] = useState<Station | null>(null);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let ignore = false;
    setLoadError('');
    setStation(null);
    setResult(null);
    Promise.all([
      getStation(stationId),
      getBatchDetail(stationId, Number(batchId)),
    ]).then(([nextStation, nextResult]) => {
      if (ignore) return;
      setStation(nextStation);
      setResult(nextResult);
      setExpandedId(nextResult.models[0]?.id ?? null);
    }).catch((e: unknown) => {
      if (ignore) return;
      const message = e instanceof Error ? e.message : String(e);
      setLoadError(message || '探测记录加载失败');
    });

    return () => { ignore = true; };
  }, [stationId, batchId]);

  if (loadError) {
    return (
      <div className="page-shell">
        <div className="page-inner">
          <section className="panel px-6 py-16 text-center">
            <h1 className="text-[18px] font-bold text-[var(--ink)]">探测记录不存在或无法访问</h1>
            <p className="mt-2 text-[13px] text-[var(--ink-faint)]">{loadError}</p>
            <Link to={`/stations/${stationId}`} className="btn-primary mt-5">返回站点</Link>
          </section>
        </div>
      </div>
    );
  }

  if (!station || !result?.batch) {
    return <div className="flex h-full items-center justify-center text-sm text-[var(--ink-faint)]">加载中...</div>;
  }

  const sortedModels = [...result.models].sort((a, b) => Number(b.available) - Number(a.available) || a.model_id.localeCompare(b.model_id));
  const resultLabel = result.batch.batch_type === 'deep' ? '深度检测' : '普通探测';

  return (
    <div className="page-shell">
      <div className="page-inner">
        <header className="page-header">
          <div>
            <div className="eyebrow">
              <Link to="/" className="transition hover:text-[var(--accent-light)]">Overview</Link>
              <span className="mx-2 text-[var(--ink-faint)]">/</span>
              <Link to={`/stations/${stationId}`} className="transition hover:text-[var(--accent-light)]">{station.name}</Link>
            </div>
            <h1 className="page-title">{resultLabel} #{result.batch.id}</h1>
            <p className="page-subtitle font-mono">{new Date(result.batch.probed_at).toLocaleString('zh-CN')}</p>
          </div>
          <Link to={`/stations/${stationId}`} className="btn-ghost">返回站点</Link>
        </header>

        <section className="panel mb-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="section-title">本次结果</h2>
              <p className="mt-1 text-[12px] text-[var(--ink-faint)]">直接查看模型是否可用，展开行可看请求和响应证据。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="status-pill bg-[var(--ok-dim)] text-[var(--ok-light)]">可用 {result.batch.available_models}</span>
              <span className="status-pill bg-[var(--bad-dim)] text-[var(--bad-light)]">不可用 {result.batch.unavailable_models}</span>
              <span className="status-pill bg-[var(--surface-2)] text-[var(--ink-dim)]">共 {result.batch.total_models}</span>
              <span className="status-pill bg-[var(--accent-dim)] text-[var(--accent-light)]">{result.batch.duration_ms}ms</span>
            </div>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="section-head">
            <h2 className="section-title">模型明细</h2>
            <span className="font-mono text-[11px] text-[var(--ink-faint)]">{sortedModels.length} models</span>
          </div>
          <div>
            {sortedModels.map((model) => {
              const attempts = parseAttempts(model.response_body);
              const requests = parseRequests(model.request_body);
              const veridropReport = parseVeridropReport(model.response_body);
              const flags = parseFlags(model.degradation_flags);
              const capabilities = parseCapabilityFlags(model.degradation_flags);
              const diagnosticStatus = diagnosticStatusLabel(flags, model.authenticity_score, model.available, attempts);
              const isExpanded = expandedId === model.id;

              return (
                <article key={model.id} className="border-t first:border-t-0" style={{ borderColor: 'var(--line)' }}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : model.id)}
                    className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left transition hover:bg-[var(--surface-2)]"
                  >
                    <span className={`status-dot ${model.available ? 'bg-[var(--ok-light)] text-[var(--ok-light)]' : 'bg-[var(--bad-light)] text-[var(--bad-light)]'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[13px] font-bold text-[var(--ink)]">{model.model_id}</span>
                      {model.response_preview && (
                        <span className="mt-1 block truncate font-mono text-[11px] text-[var(--ink-faint)]">{model.response_preview}</span>
                      )}
                    </span>
                    <span className={`status-pill ${model.available ? 'bg-[var(--ok-dim)] text-[var(--ok-light)]' : 'bg-[var(--bad-dim)] text-[var(--bad-light)]'}`}>
                      {model.available ? `${model.ttft_ms}ms` : '不可用'}
                    </span>
                  </button>

                  {(flags.length > 0 || capabilities.length > 0 || diagnosticStatus || model.authenticity_score !== null) && (
                    <div className="flex flex-wrap gap-1 px-5 pb-3">
                      {diagnosticStatus && <span className="status-pill bg-[var(--ok-dim)] text-[var(--ok-light)]">{diagnosticStatus}</span>}
                      {flags.map((flag) => <span key={flag} className="status-pill bg-[var(--warn-dim)] text-[var(--warn-light)]">{degradationFlagLabel[flag] ?? flag}</span>)}
                      {capabilities.map((capability) => <span key={capability} className="status-pill bg-[var(--info-dim)] text-[var(--info-light)]">{capabilityFlagLabel[capability] ?? capability}</span>)}
                      {model.authenticity_score !== null && (
                        <span className="status-pill bg-[var(--surface-2)] text-[var(--ink-dim)]">
                          置信 {Math.round(model.authenticity_score * 100)}%
                        </span>
                      )}
                    </div>
                  )}

                  {model.error_message && (
                    <p className="px-5 pb-3 text-[12px] text-[var(--bad-light)]">{model.error_message}</p>
                  )}

                  {isExpanded && (
                    <div className="border-t px-5 py-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
                      {veridropReport ? (
                        <VeridropReportPanel report={veridropReport} />
                      ) : attempts.length > 0 ? (
                        <div className="space-y-3">
                          {attempts.map((attempt, idx) => {
                            const req = requests[idx];
                            return (
                              <div key={`${attempt.endpoint}-${idx}`} className="panel overflow-hidden">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5" style={{ borderColor: 'var(--line)' }}>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-semibold text-[var(--ink)]">{endpointLabel[attempt.endpoint] ?? attempt.endpoint}</span>
                                    <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-dim)]" style={{ borderColor: 'var(--line-soft)' }}>{attemptRole(idx, attempts)}</span>
                                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${attempt.available ? 'bg-[var(--ok-dim)] text-[var(--ok-light)]' : 'bg-[var(--bad-dim)] text-[var(--bad-light)]'}`}>
                                      {attempt.available ? `TTFT ${attempt.ttft_ms}ms` : '失败'}
                                    </span>
                                  </div>
                                  <code className="max-w-full truncate font-mono text-[11px] text-[var(--ink-faint)]">{attempt.url}</code>
                                </div>
                                {attempt.error_message && (
                                  <p className="border-b px-3 py-2 text-xs text-[var(--bad-light)]" style={{ borderColor: 'var(--line)' }}>{attempt.error_message}</p>
                                )}
                                <div className="grid gap-3 p-3 lg:grid-cols-2">
                                  <div>
                                    <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">请求</div>
                                    <pre className="max-h-40 overflow-auto rounded-md border p-2 font-mono text-[10px] leading-5 text-[var(--ink-dim)]" style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}>{formatRequestRecord(req)}</pre>
                                  </div>
                                  <div>
                                    <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">响应</div>
                                    <pre className="max-h-40 overflow-auto rounded-md border p-2 font-mono text-[10px] leading-5 text-[var(--ink-dim)]" style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}>{formatJson(attempt.response_body)}</pre>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="grid gap-3 lg:grid-cols-2">
                          <div>
                            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">请求体</div>
                            <pre className="max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs leading-5 text-[var(--ink-dim)]" style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}>{formatJson(model.request_body)}</pre>
                          </div>
                          <div>
                            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">响应体</div>
                            <pre className="max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs leading-5 text-[var(--ink-dim)]" style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}>{formatJson(model.response_body)}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
