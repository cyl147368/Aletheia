import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getLatestDeepResult, getLatestResult, getStation, getStationHistory, getStationModels, triggerProbe,
  type BatchSummary, type DetectionMode, type ModelCatalogItem, type ModelPricing, type ProbeResult, type Station,
} from '../api';
import { VeridropReportPanel } from '../components/VeridropReportPanel';
import {
  attemptRole, capabilityFlagLabel, degradationFlagLabel, diagnosticStatusLabel, endpointLabel,
  formatJson, formatRequestRecord, parseAttempts, parseCapabilityFlags, parseFlags, parseRequests, parseVeridropReport,
} from '../utils/probeDisplay';

const stBadge: Record<Station['status'], string> = {
  ok: 'bg-ok txt-ok', degraded: 'bg-warn txt-warn', down: 'bg-bad txt-bad', unknown: 'bg-surface-2 txt-faint',
};
const modeLabel: Record<DetectionMode, string> = { quick: '快速', standard: '标准', full: '完整' };

function fmtPrice(v?: number) {
  if (v === undefined) return null;
  if (v === 0) return '0';
  if (Math.abs(v) < 0.0001) return v.toExponential(2);
  return `${v}`;
}
function fmtPricing(p: ModelPricing | null) {
  if (!p) return null;
  const parts = [['In', p.prompt], ['Out', p.completion], ['Req', p.request]].flatMap(([l, v]) => { const f = fmtPrice(v as number | undefined); return f ? [`${l} ${f}`] : []; });
  const suffix = [p.currency, p.unit].filter(Boolean).join('/');
  if (!parts.length) return null;
  const src = p.source === 'site' ? '站点价' : p.source === 'official_estimate' ? '官方估' : '';
  return `${src}${src ? ' · ' : ''}${parts.join(' · ')}${suffix ? ' ' + suffix : ''}`;
}
function fmtTime(v: string) { return new Date(v).toLocaleString('zh-CN'); }

export default function StationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const sid = Number(id);
  const [station, setStation] = useState<Station | null>(null);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [deepResult, setDeepResult] = useState<ProbeResult | null>(null);
  const [history, setHistory] = useState<BatchSummary[]>([]);
  const [view, setView] = useState<'probe' | 'deep'>('probe');
  const [catalog, setCatalog] = useState<ModelCatalogItem[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelErr, setModelErr] = useState('');
  const [probing, setProbing] = useState(false);
  const [deepMode, setDeepMode] = useState<DetectionMode | null>(null);
  const [loadingRes, setLoadingRes] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchData = useCallback(async (stale: () => boolean = () => false) => {
    setErr('');
    try {
      const ns = await getStation(sid);
      if (stale()) return;
      setStation(ns); setLoadingRes(true);
      const [r, dr, h] = await Promise.all([
        getLatestResult(sid).catch(() => null),
        getLatestDeepResult(sid).catch(() => null),
        getStationHistory(sid, 'probe').catch(() => ({ batches: [], page: 1, page_size: 20 })),
      ]);
      if (stale()) return;
      setResult(r); setDeepResult(dr); setHistory(h.batches);
      if (!r?.batch && dr?.batch) setView('deep');
    } catch (e: unknown) {
      if (!stale()) { setErr(e instanceof Error ? e.message : String(e)); setStation(null); }
    } finally { if (!stale()) setLoadingRes(false); }
  }, [sid]);

  const fetchModels = useCallback(async () => {
    setLoadingModels(true); setModelErr('');
    try {
      const c = await getStationModels(sid);
      setCatalog(c.models); setSelected(new Set(c.models.map(m => m.id)));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setModelErr(msg || '获取失败'); setCatalog([]); setSelected(new Set());
    } finally { setLoadingModels(false); }
  }, [sid]);

  useEffect(() => { let ignore = false; fetchData(() => ignore); return () => { ignore = true; }; }, [fetchData]);

  const active = view === 'deep' ? deepResult : result;
  useEffect(() => { setExpanded(active?.models[0]?.id ?? null); }, [active]);

  const doProbe = async () => {
    if (!catalog.length) { alert('请先获取模型列表'); return; }
    const ids = Array.from(selected);
    if (!ids.length) { alert('请选择至少一个模型'); return; }
    setProbing(true);
    try { await triggerProbe(sid, ids); await fetchData(); setView('probe'); } finally { setProbing(false); }
  };

  const doDeep = async (mode: DetectionMode) => {
    const ids = Array.from(selected);
    if (!ids.length) { alert('请选择至少一个模型'); return; }
    setDeepMode(mode);
    try { await triggerProbe(sid, ids, mode); await fetchData(); setView('deep'); } finally { setDeepMode(null); }
  };

  if (!station && err) {
    return (
      <div className="page-shell">
        <div className="page-inner">
          <section className="panel px-6 py-16 text-center">
            <h1 className="text-[18px] font-bold text-[var(--ink)]">站点不存在</h1>
            <p className="mt-2 txt-faint text-[13px]">{err}</p>
            <Link to="/" className="button-primary mt-5">返回总览</Link>
          </section>
        </div>
      </div>
    );
  }
  if (!station) return <div className="flex h-full items-center justify-center txt-faint text-sm">加载中...</div>;

  const hasCat = catalog.length > 0;
  const busy = probing || deepMode !== null;
  const searchLow = search.trim().toLowerCase();
  const filtered = searchLow ? catalog.filter(m => m.id.toLowerCase().includes(searchLow)) : catalog;
  const selCount = selected.size;
  const models = [...(active?.models ?? [])].sort((a, b) => Number(b.available) - Number(a.available) || a.model_id.localeCompare(b.model_id));
  const probeText = probing ? '探测中...' : hasCat ? `探测 ${selCount} 个` : loadingModels ? '获取中...' : '获取模型';
  const activeLabel = view === 'deep' ? '深度检测' : '普通探测';
  const hasProbe = Boolean(result?.batch);
  const hasDeep = Boolean(deepResult?.batch);

  return (
    <div className="page-shell">
      <div className="page-inner">

        <section className="panel hero-band">
          <div className="min-w-0">
            <div className="eyebrow"><Link to="/" className="transition hover:text-[var(--accent-light)]">总览</Link></div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="page-title m-0">{station.name}</h1>
              <span className={`status-pill ${stBadge[station.status]}`}>{station.status === 'ok' ? '正常' : station.status === 'degraded' ? '需关注' : station.status === 'down' ? '异常' : '未探测'}</span>
            </div>
            <p className="mt-2 font-mono text-[11px] txt-faint">{station.base_url}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {station.official_url && <a href={station.official_url} target="_blank" rel="noreferrer" className="button-ghost">官网</a>}
            <span className="stat-block">{station.schedule_enabled ? `每${station.schedule_interval_hours}h` : '定时关闭'}</span>
          </div>
        </section>

        <div className="detail-layout">
          <aside className="sticky-pane flex flex-col gap-4">
            <section className="panel side-card">
              <div className="eyebrow">Probe</div>
              <h2 className="mt-1 text-[15px] font-bold text-[var(--ink)]">探测</h2>
              <p className="txt-faint text-[11px]">{hasCat ? `已选 ${selCount}/${catalog.length}` : '未获取模型列表'}</p>

              <div className="mt-4 flex gap-2">
                <button onClick={fetchModels} disabled={loadingModels || busy} className="button-ghost flex-1">{loadingModels ? '获取中' : hasCat ? '刷新' : '获取模型'}</button>
                <button onClick={() => setSelected(new Set(catalog.map(m => m.id)))} disabled={!hasCat || busy} className="button-ghost flex-1">全选</button>
                <button onClick={() => setSelected(new Set())} disabled={!hasCat || busy} className="button-ghost flex-1">清空</button>
              </div>

              <input value={search} onChange={e => setSearch(e.target.value)} className="input-base mt-3 w-full font-mono text-[11px]" placeholder="搜索模型..." disabled={!hasCat} />

              <div className="mt-3 max-h-[240px] overflow-y-auto">
                {modelErr ? (
                  <p className="txt-bad text-[12px]">{modelErr}</p>
                ) : filtered.length > 0 ? filtered.map(m => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-3 px-1 py-1.5 text-left">
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => { const n = new Set(selected); n.has(m.id) ? n.delete(m.id) : n.add(m.id); setSelected(n); }} className="h-3.5 w-3.5 accent-[var(--accent)]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[11px] font-semibold text-[var(--ink)]">{m.id}</div>
                      {fmtPricing(m.pricing) && <div className="truncate font-mono text-[9px] txt-faint">{fmtPricing(m.pricing)}</div>}
                    </div>
                  </label>
                )) : (
                  <p className="py-4 text-center txt-faint text-[11px]">{loadingModels ? '获取中...' : '无匹配'}</p>
                )}
              </div>

              <button onClick={doProbe} disabled={busy || loadingModels || (hasCat && selCount === 0)} className="button-primary mt-3 h-9 w-full">{probeText}</button>

              <div className="modal-divider" />

              <p className="txt-faint text-[11px] font-bold">深度检测</p>
              <div className="mt-2 flex gap-2">
                {(['quick', 'standard', 'full'] as DetectionMode[]).map(m => (
                  <button key={m} onClick={() => doDeep(m)} disabled={busy || loadingModels || !hasCat || selCount === 0} className="button-ghost flex-1 text-[11px]">
                    {deepMode === m ? '运行中' : modeLabel[m]}
                  </button>
                ))}
              </div>
            </section>

            <section className="panel side-card">
              <div className="eyebrow">History</div>
              <h2 className="mt-1 text-[13px] font-bold text-[var(--ink)]">历史记录</h2>
              <div className="mt-2 space-y-1">
                {loadingRes ? (
                  <p className="txt-faint text-[11px]">读取中...</p>
                ) : history.length === 0 ? (
                  <p className="txt-faint text-[11px]">暂无</p>
                ) : history.slice(0, 6).map(b => (
                  <Link key={b.id} to={`/stations/${sid}/probe/${b.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[11px] transition hover:bg-[var(--surface-2)]">
                    <span className="font-mono font-bold text-[var(--ink)]">#{b.id}</span>
                    <span className="txt-faint">{fmtTime(b.probed_at)}</span>
                    <span className="txt-dim">{b.available_models}/{b.total_models}</span>
                  </Link>
                ))}
              </div>
            </section>
          </aside>

          <div className="flex flex-col gap-4">
            <section className="panel result-card">
              <div className="result-head">
                <div>
                  <div className="eyebrow">Result</div>
                  <h2 className="mt-1 text-[18px] font-bold text-[var(--ink)]">{activeLabel}</h2>
                  <p className="txt-faint text-[11px]">{active?.batch ? fmtTime(active.batch.probed_at) : loadingRes ? '读取中...' : '暂无记录'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setView('probe')} disabled={!hasProbe} className={`button-ghost ${view === 'probe' ? 'border-[var(--accent)] text-[var(--accent-light)]' : ''}`}>探测</button>
                  <button onClick={() => setView('deep')} disabled={!hasDeep} className={`button-ghost ${view === 'deep' ? 'border-[var(--accent)] text-[var(--accent-light)]' : ''}`}>深度</button>
                  {active?.batch && <Link to={`/stations/${sid}/probe/${active.batch.id}`} className="button-primary">详情</Link>}
                </div>
              </div>
              {active?.batch && (
                <div className="mt-4 stat-bar">
                  <span className="stat-block bg-ok"><span className="num">{active.batch.available_models}</span> 可用</span>
                  <span className="stat-block bg-bad"><span className="num">{active.batch.unavailable_models}</span> 不可用</span>
                  <span className="stat-block"><span className="num">{active.batch.total_models}</span> 总计</span>
                  <span className="stat-block bg-info"><span className="num">{active.batch.duration_ms}</span>ms</span>
                </div>
              )}
            </section>

            {models.length === 0 ? (
              <section className="panel px-6 py-16 text-center">
                <h2 className="text-[16px] font-bold text-[var(--ink)]">{loadingRes ? '读取中...' : `暂无${activeLabel}结果`}</h2>
                <p className="mt-2 txt-faint text-[13px]">选择模型后运行探测</p>
                <button onClick={doProbe} disabled={busy || loadingModels || (hasCat && selCount === 0)} className="button-primary mt-4">{probeText}</button>
              </section>
            ) : (
              <section className="panel overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4">
                  <div>
                    <div className="eyebrow">Models</div>
                    <h2 className="mt-1 text-[13px] font-bold text-[var(--ink)]">模型结果</h2>
                  </div>
                  <span className="txt-faint text-[11px]">{models.length} 个</span>
                </div>
                {models.map(m => {
                  const flags = parseFlags(m.degradation_flags);
                  const caps = parseCapabilityFlags(m.degradation_flags);
                  const attempts = parseAttempts(m.response_body);
                  const reqs = parseRequests(m.request_body);
                  const vr = parseVeridropReport(m.response_body);
                  const diag = diagnosticStatusLabel(flags, m.authenticity_score, m.available, attempts);
                  const isExpanded = expanded === m.id;
                  return (
                    <div key={m.id}>
                      <div className="card-row cursor-pointer" onClick={() => setExpanded(isExpanded ? null : m.id)}>
                        <span className={`status-dot ${m.available ? 'bg-[var(--ok-light)]' : 'bg-[var(--bad-light)]'}`} />
                        <span className="min-w-0 flex-1 font-mono text-[12px] font-semibold text-[var(--ink)]">{m.model_id}</span>
                        <span className={`status-pill ${m.available ? 'bg-ok txt-ok' : 'bg-bad txt-bad'}`}>{m.available ? `${m.ttft_ms}ms` : '不可用'}</span>
                        {(flags.length > 0 || caps.length > 0 || diag) && (
                          <div className="hidden gap-1 md:flex">
                            {diag && <span className="status-pill bg-ok txt-ok">{diag}</span>}
                            {flags.slice(0, 2).map(f => <span key={f} className="status-pill bg-warn txt-warn">{degradationFlagLabel[f] ?? f}</span>)}
                            {caps.slice(0, 2).map(c => <span key={c} className="status-pill bg-info txt-info">{capabilityFlagLabel[c] ?? c}</span>)}
                          </div>
                        )}
                      </div>
                      {isExpanded && (
                        <div className="expand-area">
                          {m.error_message && <p className="mb-3 txt-bad text-[12px]">{m.error_message}</p>}
                          {vr ? <VeridropReportPanel report={vr} /> : (
                            <div className="flex flex-col gap-3">
                              {attempts.length > 0 ? attempts.map((a, i) => {
                                const r = reqs[i];
                                return (
                                  <div key={`${a.endpoint}-${i}`} className="attempt-card">
                                    <div className="attempt-head">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-[12px] font-semibold text-[var(--ink)]">{endpointLabel[a.endpoint] ?? a.endpoint}</span>
                                        <span className="rounded border px-1.5 py-0.5 text-[10px] font-medium txt-faint" style={{ borderColor: 'var(--line)' }}>{attemptRole(i, attempts)}</span>
                                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${a.available ? 'bg-ok txt-ok' : 'bg-bad txt-bad'}`}>{a.available ? `TTFT ${a.ttft_ms}ms` : '失败'}</span>
                                      </div>
                                      <code className="truncate font-mono text-[10px] txt-faint">{a.url}</code>
                                    </div>
                                    {a.error_message && <p className="border-b px-3 py-2 text-[11px] txt-bad" style={{ borderColor: 'var(--line)' }}>{a.error_message}</p>}
                                    <div className="attempt-code">
                                      <div><p className="mb-1 text-[9px] font-bold uppercase tracking-wider txt-faint">请求</p><pre className="max-h-32 overflow-auto rounded border bg-[var(--bg)] p-2 font-mono text-[10px] leading-5 txt-dim" style={{ borderColor: 'var(--line)' }}>{formatRequestRecord(r)}</pre></div>
                                      <div><p className="mb-1 text-[9px] font-bold uppercase tracking-wider txt-faint">响应</p><pre className="max-h-32 overflow-auto rounded border bg-[var(--bg)] p-2 font-mono text-[10px] leading-5 txt-dim" style={{ borderColor: 'var(--line)' }}>{formatJson(a.response_body)}</pre></div>
                                    </div>
                                  </div>
                                );
                              }) : (
                                <div className="attempt-code">
                                  <div><p className="mb-1 text-[9px] font-bold uppercase tracking-wider txt-faint">请求体</p><pre className="max-h-48 overflow-auto rounded border bg-[var(--bg)] p-3 font-mono text-[11px] leading-5 txt-dim" style={{ borderColor: 'var(--line)' }}>{formatJson(m.request_body)}</pre></div>
                                  <div><p className="mb-1 text-[9px] font-bold uppercase tracking-wider txt-faint">响应体</p><pre className="max-h-48 overflow-auto rounded border bg-[var(--bg)] p-3 font-mono text-[11px] leading-5 txt-dim" style={{ borderColor: 'var(--line)' }}>{formatJson(m.response_body)}</pre></div>
                                </div>
                              )}
                            </div>
                          )}
                          {m.authenticity_score !== null && (
                            <div className="mt-3 text-[11px] txt-dim">置信度: {Math.round(m.authenticity_score * 100)}%</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
