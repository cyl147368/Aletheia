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
    return <div className="flex h-full items-center justify-center text-sm text-[var(--ink-faint)]">加载中...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-7 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <Link to="/" className="text-[11px] font-mono text-[var(--ink-faint)] transition hover:text-[var(--accent-light)]">看板</Link>
        <span style={{ color: 'var(--line-soft)' }}>/</span>
        <Link to={`/stations/${stationId}`} className="text-[11px] font-mono text-[var(--ink-faint)] transition hover:text-[var(--accent-light)]">{station.name}</Link>
        <span style={{ color: 'var(--line-soft)' }}>/</span>
        <span className="text-[16px] font-bold text-[var(--ink)]">探测 #{result.batch.id}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-7">
        {/* Timestamp */}
        <p className="text-[12px] font-mono text-[var(--ink-faint)] mb-6">
          检测时间：{new Date(result.batch.probed_at).toLocaleString('zh-CN')}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: '总模型', value: result.batch.total_models, color: 'var(--ink)' },
            { label: '可用', value: result.batch.available_models, color: 'var(--ok-light)' },
            { label: '不可用', value: result.batch.unavailable_models, color: 'var(--bad-light)' },
            { label: '耗时', value: `${result.batch.duration_ms}ms`, color: 'var(--accent-light)' },
          ].map((item) => (
            <div key={item.label} className="panel p-5">
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-faint)' }}>{item.label}</div>
              <div className="text-[24px] font-extrabold tabular-nums tracking-tight" style={{ color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Models */}
        <div className="panel overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            <span className="text-[12px] font-semibold text-[var(--ink)]">模型明细</span>
            <span className="text-[10px] font-mono text-[var(--ink-faint)] ml-auto">{result.models.length} models</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {result.models.map((model) => {
              const attempts = parseAttempts(model.response_body);
              const requests = parseRequests(model.request_body);
              const veridropReport = parseVeridropReport(model.response_body);
              const flags = parseFlags(model.degradation_flags);
              const capabilities = parseCapabilityFlags(model.degradation_flags);
              const diagnosticStatus = diagnosticStatusLabel(flags, model.authenticity_score, model.available, attempts);
              const isExpanded = expandedId === model.id;

              return (
                <article key={model.id} style={{ borderColor: 'var(--line)' }}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : model.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-5 py-4 text-left transition hover:bg-[var(--surface)] cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[13px] font-medium text-[var(--ink)]">{model.model_id}</span>
                      <span className={`inline-flex min-w-14 justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${model.available ? 'bg-[var(--ok-dim)] text-[var(--ok-light)]' : 'bg-[var(--bad-dim)] text-[var(--bad-light)]'}`}>
                        {model.available ? `可用 · ${model.ttft_ms}ms` : '不可用'}
                      </span>
                    </div>
                    {model.response_preview && (
                      <span className="max-w-md truncate font-mono text-[11px] text-[var(--ink-dim)]" title={model.response_preview}>{model.response_preview}</span>
                    )}
                  </button>

                  {/* Tags */}
                  {(flags.length > 0 || capabilities.length > 0 || diagnosticStatus) && (
                    <div className="flex flex-wrap gap-1 px-5 pb-2">
                      {diagnosticStatus && <span className="inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold bg-[var(--ok-dim)] text-[var(--ok-light)]">{diagnosticStatus}</span>}
                      {flags.map((f) => <span key={f} className="inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold bg-[var(--warn-dim)] text-[var(--warn-light)]">{degradationFlagLabel[f] ?? f}</span>)}
                      {capabilities.map((c) => <span key={c} className="inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold bg-[var(--info-dim)] text-[var(--info-light)]">{capabilityFlagLabel[c] ?? c}</span>)}
                      {model.authenticity_score !== null && (
                        <span className="inline-flex rounded-md border px-1.5 py-0.5 text-[9px] font-medium text-[var(--ink-dim)]" style={{ borderColor: 'var(--line-soft)', background: 'var(--surface-2)' }}>
                          置信 {Math.round(model.authenticity_score * 100)}%
                        </span>
                      )}
                    </div>
                  )}
                  {model.error_message && <p className="px-5 pb-2 text-xs" style={{ color: 'var(--bad-light)', opacity: 0.8 }}>{model.error_message}</p>}

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t px-5 py-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
                      <div className="space-y-2.5">
                        {veridropReport ? (
                          <VeridropReportPanel report={veridropReport} />
                        ) : attempts.map((attempt, idx) => {
                          const req = requests[idx];
                          return (
                            <div key={`${attempt.endpoint}-${idx}`} className="panel overflow-hidden" style={{ borderRadius: 10 }}>
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--line)' }}>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-[var(--ink)]">{endpointLabel[attempt.endpoint] ?? attempt.endpoint}</span>
                                  <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-dim)]" style={{ borderColor: 'var(--line-soft)', background: 'var(--surface-2)' }}>{attemptRole(idx, attempts)}</span>
                                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${attempt.available ? 'bg-[var(--ok-dim)] text-[var(--ok-light)]' : 'bg-[var(--bad-dim)] text-[var(--bad-light)]'}`}>
                                    {attempt.available ? `TTFT ${attempt.ttft_ms}ms` : '失败'}
                                  </span>
                                </div>
                                <code className="font-mono text-[11px] text-[var(--ink-faint)]">{attempt.url}</code>
                              </div>
                              {attempt.error_message && <p className="border-b px-3 py-2 text-xs" style={{ borderColor: 'var(--line)', color: 'var(--bad-light)', opacity: 0.8 }}>{attempt.error_message}</p>}
                              <div className="grid gap-3 p-3 lg:grid-cols-2">
                                <div>
                                  <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">请求</div>
                                  <pre className="max-h-40 overflow-auto rounded-lg border p-2 text-[10px] leading-5 font-mono" style={{ borderColor: 'var(--line)', background: 'var(--bg)', color: 'var(--ink-dim)' }}>{formatRequestRecord(req)}</pre>
                                </div>
                                <div>
                                  <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">响应</div>
                                  <pre className="max-h-40 overflow-auto rounded-lg border p-2 text-[10px] leading-5 font-mono" style={{ borderColor: 'var(--line)', background: 'var(--bg)', color: 'var(--ink-dim)' }}>{formatJson(attempt.response_body)}</pre>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
