import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getBatchDetail, getStation, type ProbeResult, type Station } from '../api';
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
    return <div className="py-12 text-center text-sm text-[var(--ink-faint)]">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 font-mono text-xs text-[var(--ink-faint)]">
        <Link to="/" className="transition hover:text-[var(--accent)]">看板</Link>
        <span className="text-[var(--line)]">/</span>
        <Link to={`/stations/${stationId}`} className="transition hover:text-[var(--accent)]">{station.name}</Link>
        <span className="text-[var(--line)]">/</span>
        <span className="text-[var(--ink-dim)]">探测 #{result.batch.id}</span>
      </nav>

      <header className="border-b border-[var(--line)] pb-5">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--ink-faint)]">Probe result</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink)]">探测结果</h1>
        <p className="mt-2 font-mono text-sm text-[var(--ink-dim)]">
          {new Date(result.batch.probed_at).toLocaleString('zh-CN')}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '总模型', value: result.batch.total_models },
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

      <section className="panel rounded-lg overflow-hidden">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] dot-glow text-[var(--accent)]" />
            模型明细
          </h2>
        </div>
        <div className="divide-y divide-[var(--line-soft)]">
          {result.models.map((model) => {
            const attempts = parseAttempts(model.response_body);
            const requests = parseRequests(model.request_body);
            const flags = parseFlags(model.degradation_flags);
            const capabilities = parseCapabilityFlags(model.degradation_flags);
            const diagnosticStatus = diagnosticStatusLabel(flags, model.authenticity_score, model.available, attempts);
            return (
              <article key={model.id} className="px-4 py-4">
                <header className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium text-[var(--ink)]">{model.model_id}</span>
                    <span
                      className={`inline-flex min-w-16 justify-center rounded border px-2 py-1 text-xs font-medium ${
                        model.available
                          ? 'border-[var(--ok)]/30 bg-[var(--ok)]/10 text-[var(--ok)]'
                          : 'border-[var(--bad)]/30 bg-[var(--bad)]/10 text-[var(--bad)]'
                      }`}
                    >
                      {model.available ? `可用 · ${model.ttft_ms}ms` : '不可用'}
                    </span>
                  </div>
                  {model.response_preview && (
                    <span className="max-w-md truncate font-mono text-xs text-[var(--ink-dim)]" title={model.response_preview}>
                      {model.response_preview}
                    </span>
                  )}
                </header>
                {(flags.length > 0 || capabilities.length > 0 || diagnosticStatus) && (
                  <div className="mt-2 flex flex-wrap gap-1">
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
                    {model.authenticity_score !== null && (
                      <span className="inline-flex rounded border border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-dim)]">
                        置信 {Math.round(model.authenticity_score * 100)}%
                      </span>
                    )}
                  </div>
                )}
                {model.error_message && (
                  <p className="mt-2 text-xs text-[var(--bad)]/80">{model.error_message}</p>
                )}
                <div className="mt-3 space-y-3">
                  {attempts.map((attempt, index) => {
                    const req = requests[index];
                    return (
                      <div key={`${attempt.endpoint}-${index}`} className="rounded border border-[var(--line)] bg-[var(--surface-2)]/40">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[var(--ink)]">
                              {endpointLabel[attempt.endpoint] ?? attempt.endpoint}
                            </span>
                            <span className="inline-flex rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-dim)]">
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
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
