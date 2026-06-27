import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getBatchDetail, getStation, type ProbeResult, type Station } from '../api';
import {
  attemptRole,
  capabilityFlagLabel,
  degradationFlagLabel,
  endpointLabel,
  formatJson,
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
        <div className="divide-y divide-slate-100">
          {result.models.map((model) => {
            const attempts = parseAttempts(model.response_body);
            const requests = parseRequests(model.request_body);
            const flags = parseFlags(model.degradation_flags);
            const capabilities = parseCapabilityFlags(model.degradation_flags);
            return (
              <article key={model.id} className="px-4 py-4">
                <header className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium text-slate-950">{model.model_id}</span>
                    <span
                      className={`inline-flex min-w-16 justify-center border px-2 py-1 text-xs font-medium ${
                        model.available
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-rose-200 bg-rose-50 text-rose-700'
                      }`}
                    >
                      {model.available ? `可用 · ${model.ttft_ms}ms` : '不可用'}
                    </span>
                  </div>
                  {model.response_preview && (
                    <span className="max-w-md truncate text-xs text-slate-500" title={model.response_preview}>
                      {model.response_preview}
                    </span>
                  )}
                </header>
                {(flags.length > 0 || capabilities.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1">
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
                    {model.authenticity_score !== null && (
                      <span className="inline-flex border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        置信 {Math.round(model.authenticity_score * 100)}%
                      </span>
                    )}
                  </div>
                )}
                {model.error_message && (
                  <p className="mt-2 text-xs text-rose-600">{model.error_message}</p>
                )}
                <div className="mt-3 space-y-3">
                  {attempts.map((attempt, index) => {
                    const req = requests[index];
                    return (
                      <div key={`${attempt.endpoint}-${index}`} className="border border-slate-200 bg-slate-50">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-700">
                              {endpointLabel[attempt.endpoint] ?? attempt.endpoint}
                            </span>
                            <span className="inline-flex border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                              {attemptRole(index, attempts)}
                            </span>
                            <span
                              className={`inline-flex border px-1.5 py-0.5 text-[10px] font-medium ${
                                attempt.available
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-rose-200 bg-rose-50 text-rose-700'
                              }`}
                            >
                              {attempt.available ? `TTFT ${attempt.ttft_ms}ms` : '失败'}
                            </span>
                          </div>
                          <code className="font-mono text-[11px] text-slate-400">{attempt.url}</code>
                        </div>
                        {attempt.error_message && (
                          <p className="border-b border-slate-200 px-3 py-2 text-xs text-rose-600">
                            {attempt.error_message}
                          </p>
                        )}
                        <div className="grid gap-3 p-3 lg:grid-cols-2">
                          <div>
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">请求</div>
                            <pre className="max-h-40 overflow-auto border border-slate-200 bg-white p-2 text-[11px] leading-5 text-slate-700">
                              {formatJson(req?.body)}
                            </pre>
                          </div>
                          <div>
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">响应</div>
                            <pre className="max-h-40 overflow-auto border border-slate-200 bg-white p-2 text-[11px] leading-5 text-slate-700">
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
