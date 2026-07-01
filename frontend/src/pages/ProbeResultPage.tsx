import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getBatchDetail, getStation, type ProbeResult, type Station } from '../api';
import { VeridropReportPanel } from '../components/VeridropReportPanel';
import {
  attemptRole, capabilityFlagLabel, degradationFlagLabel, diagnosticStatusLabel, endpointLabel,
  formatJson, formatRequestRecord, parseAttempts, parseCapabilityFlags, parseFlags, parseRequests, parseVeridropReport,
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
    ]).then(([ns, nr]) => {
      if (ignore) return;
      setStation(ns);
      setResult(nr);
      setExpandedId(nr.models[0]?.id ?? null);
    }).catch((e: unknown) => {
      if (ignore) return;
      const message = e instanceof Error ? e.message : String(e);
      setLoadError(message || '加载失败');
    });
    return () => { ignore = true; };
  }, [stationId, batchId]);

  if (loadError) {
    return (
      <div className="page-shell">
        <div className="page-inner">
          <section className="panel px-6 py-16 text-center">
            <h1 className="text-[18px] font-bold text-[var(--ink)]">记录不存在</h1>
            <p className="mt-2 txt-faint text-[13px]">{loadError}</p>
            <Link to={`/stations/${stationId}`} className="button-primary mt-5">返回站点</Link>
          </section>
        </div>
      </div>
    );
  }

  if (!station || !result?.batch) {
    return <div className="flex h-full items-center justify-center txt-faint text-sm">加载中...</div>;
  }

  const sortedModels = [...result.models].sort((a, b) => Number(b.available) - Number(a.available) || a.model_id.localeCompare(b.model_id));
  const label = result.batch.batch_type === 'deep' ? '深度检测' : '普通探测';

  return (
    <div className="page-shell">
      <div className="page-inner">

        <section className="panel hero-band">
          <div className="min-w-0">
            <div className="eyebrow">
              <Link to="/" className="transition hover:text-[var(--accent-light)]">总览</Link>
              <span className="mx-2 txt-faint">/</span>
              <Link to={`/stations/${stationId}`} className="transition hover:text-[var(--accent-light)]">{station.name}</Link>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="page-title m-0">{label} #{result.batch.id}</h1>
            </div>
            <p className="mt-1 font-mono text-[11px] txt-faint">{new Date(result.batch.probed_at).toLocaleString('zh-CN')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/stations/${stationId}`} className="button-ghost">返回站点</Link>
            <span className="stat-block bg-ok"><span className="num">{result.batch.available_models}</span> 可用</span>
            <span className="stat-block bg-bad"><span className="num">{result.batch.unavailable_models}</span> 不可用</span>
            <span className="stat-block"><span className="num">{result.batch.total_models}</span> 总计</span>
            <span className="stat-block bg-info"><span className="num">{result.batch.duration_ms}</span>ms</span>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <div className="eyebrow">Models</div>
              <h2 className="mt-1 text-[13px] font-bold text-[var(--ink)]">模型明细</h2>
            </div>
            <span className="txt-faint text-[11px]">{sortedModels.length} 个模型</span>
          </div>
          {sortedModels.map(model => {
            const attempts = parseAttempts(model.response_body);
            const requests = parseRequests(model.request_body);
            const veridropReport = parseVeridropReport(model.response_body);
            const flags = parseFlags(model.degradation_flags);
            const capabilities = parseCapabilityFlags(model.degradation_flags);
            const diagnosticStatus = diagnosticStatusLabel(flags, model.authenticity_score, model.available, attempts);
            const isExpanded = expandedId === model.id;
            return (
              <div key={model.id}>
                <div className="card-row cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : model.id)}>
                  <span className={`status-dot ${model.available ? 'bg-[var(--ok-light)]' : 'bg-[var(--bad-light)]'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[12px] font-bold text-[var(--ink)]">{model.model_id}</span>
                    {model.response_preview && <span className="mt-0.5 block truncate font-mono text-[10px] txt-faint">{model.response_preview}</span>}
                  </span>
                  <span className={`status-pill ${model.available ? 'bg-ok txt-ok' : 'bg-bad txt-bad'}`}>
                    {model.available ? `${model.ttft_ms}ms` : '不可用'}
                  </span>
                  {(flags.length > 0 || capabilities.length > 0 || diagnosticStatus) && (
                    <div className="hidden gap-1 md:flex">
                      {diagnosticStatus && <span className="status-pill bg-ok txt-ok">{diagnosticStatus}</span>}
                      {flags.slice(0, 2).map(f => <span key={f} className="status-pill bg-warn txt-warn">{degradationFlagLabel[f] ?? f}</span>)}
                      {capabilities.slice(0, 2).map(c => <span key={c} className="status-pill bg-info txt-info">{capabilityFlagLabel[c] ?? c}</span>)}
                    </div>
                  )}
                </div>
                {isExpanded && (
                  <div className="expand-area">
                    {model.error_message && <p className="mb-3 txt-bad text-[12px]">{model.error_message}</p>}
                    {veridropReport ? <VeridropReportPanel report={veridropReport} /> : (
                      <div className="flex flex-col gap-3">
                        {attempts.length > 0 ? attempts.map((attempt, idx) => {
                          const req = requests[idx];
                          return (
                            <div key={`${attempt.endpoint}-${idx}`} className="attempt-card">
                              <div className="attempt-head">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[12px] font-semibold text-[var(--ink)]">{endpointLabel[attempt.endpoint] ?? attempt.endpoint}</span>
                                  <span className="rounded border px-1.5 py-0.5 text-[10px] font-medium txt-faint" style={{ borderColor: 'var(--line)' }}>{attemptRole(idx, attempts)}</span>
                                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${attempt.available ? 'bg-ok txt-ok' : 'bg-bad txt-bad'}`}>
                                    {attempt.available ? `TTFT ${attempt.ttft_ms}ms` : '失败'}
                                  </span>
                                </div>
                                <code className="truncate font-mono text-[10px] txt-faint">{attempt.url}</code>
                              </div>
                              {attempt.error_message && <p className="border-b px-3 py-2 text-[11px] txt-bad" style={{ borderColor: 'var(--line)' }}>{attempt.error_message}</p>}
                              <div className="attempt-code">
                                <div><p className="mb-1 text-[9px] font-bold uppercase tracking-wider txt-faint">请求</p><pre className="max-h-32 overflow-auto rounded border bg-[var(--bg)] p-2 font-mono text-[10px] leading-5 txt-dim" style={{ borderColor: 'var(--line)' }}>{formatRequestRecord(req)}</pre></div>
                                <div><p className="mb-1 text-[9px] font-bold uppercase tracking-wider txt-faint">响应</p><pre className="max-h-32 overflow-auto rounded border bg-[var(--bg)] p-2 font-mono text-[10px] leading-5 txt-dim" style={{ borderColor: 'var(--line)' }}>{formatJson(attempt.response_body)}</pre></div>
                              </div>
                            </div>
                          );
                        }) : (
                          <div className="attempt-code">
                            <div><p className="mb-1 text-[9px] font-bold uppercase tracking-wider txt-faint">请求体</p><pre className="max-h-48 overflow-auto rounded border bg-[var(--bg)] p-3 font-mono text-[11px] leading-5 txt-dim" style={{ borderColor: 'var(--line)' }}>{formatJson(model.request_body)}</pre></div>
                            <div><p className="mb-1 text-[9px] font-bold uppercase tracking-wider txt-faint">响应体</p><pre className="max-h-48 overflow-auto rounded border bg-[var(--bg)] p-3 font-mono text-[11px] leading-5 txt-dim" style={{ borderColor: 'var(--line)' }}>{formatJson(model.response_body)}</pre></div>
                          </div>
                        )}
                      </div>
                    )}
                    {model.authenticity_score !== null && (
                      <div className="mt-3 text-[11px] txt-dim">置信度: {Math.round(model.authenticity_score * 100)}%</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>

      </div>
    </div>
  );
}
