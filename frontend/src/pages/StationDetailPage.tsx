import { Fragment, useCallback, useEffect, useState } from 'react';
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

const stText: Record<Station['status'], string> = { ok: '正常', degraded: '需关注', down: '异常', unknown: '未探测' };
const stBadge: Record<Station['status'], string> = {
  ok: 'bg-[var(--ok-dim)] text-[var(--ok-light)]',
  degraded: 'bg-[var(--warn-dim)] text-[var(--warn-light)]',
  down: 'bg-[var(--bad-dim)] text-[var(--bad-light)]',
  unknown: 'bg-[var(--surface-2)] text-[var(--ink-dim)]',
};
const stDot: Record<Station['status'], string> = {
  ok: 'bg-[var(--ok-light)]', degraded: 'bg-[var(--warn-light)]', down: 'bg-[var(--bad-light)]', unknown: 'bg-[var(--ink-faint)]',
};
const modeLabel: Record<DetectionMode, string> = { quick: '快速', standard: '标准', full: '完整' };

function fmtPrice(v?: number) {
  if (v === undefined) return null;
  if (v === 0) return '0';
  if (Math.abs(v) < 0.0001) return v.toExponential(2);
  return `${v}`;
}
function fmtPricing(p: ModelPricing | null) {
  if (!p) return '无价格';
  const parts = [['In', p.prompt], ['Out', p.completion], ['Req', p.request]].flatMap(([l, v]) => { const f = fmtPrice(v as number | undefined); return f ? [`${l} ${f}`] : []; });
  const suffix = [p.currency, p.unit].filter(Boolean).join('/');
  if (!parts.length) return '无价格';
  const src = p.source === 'site' ? '站点价' : p.source === 'official_estimate' ? '官方估' : '价格';
  return `${src} · ${suffix ? parts.join(' · ') + ' ' + suffix : parts.join(' · ')}`;
}
function fmtTime(v: string) { return new Date(v).toLocaleString('zh-CN'); }

function ModelExpand({ model }: { model: NonNullable<ProbeResult>['models'][number] }) {
  const att = parseAttempts(model.response_body);
  const reqs = parseRequests(model.request_body);
  const vr = parseVeridropReport(model.response_body);
  return (
    <td colSpan={4} className="px-5 py-4" style={{ background: 'var(--surface-2)' }}>
      <div className="space-y-3">
        {vr ? <VeridropReportPanel report={vr} /> : att.length > 0 ? att.map((a, i) => {
          const r = reqs[i];
          return (
            <div key={`${a.endpoint}-${i}`} className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--line)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--ink)]">{endpointLabel[a.endpoint] ?? a.endpoint}</span>
                  <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-dim)]" style={{ borderColor: 'var(--line-soft)' }}>{attemptRole(i, att)}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${a.available ? 'bg-[var(--ok-dim)] text-[var(--ok-light)]' : 'bg-[var(--bad-dim)] text-[var(--bad-light)]'}`}>{a.available ? `TTFT ${a.ttft_ms}ms` : '失败'}</span>
                </div>
                <code className="max-w-full truncate font-mono text-[11px] text-[var(--ink-faint)]">{a.url}</code>
              </div>
              {a.error_message && <p className="border-b px-3 py-2 text-xs text-[var(--bad-light)]" style={{ borderColor: 'var(--line)' }}>{a.error_message}</p>}
              <div className="grid gap-3 p-3 lg:grid-cols-2">
                <div><div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">请求</div><pre className="max-h-40 overflow-auto rounded-md border p-2 font-mono text-[10px] leading-5 text-[var(--ink-dim)]" style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}>{formatRequestRecord(r)}</pre></div>
                <div><div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">响应</div><pre className="max-h-40 overflow-auto rounded-md border p-2 font-mono text-[10px] leading-5 text-[var(--ink-dim)]" style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}>{formatJson(a.response_body)}</pre></div>
              </div>
            </div>
          );
        }) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <div><div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">请求体</div><pre className="max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs leading-5 text-[var(--ink-dim)]" style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}>{formatJson(model.request_body)}</pre></div>
            <div><div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">响应体</div><pre className="max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs leading-5 text-[var(--ink-dim)]" style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}>{formatJson(model.response_body)}</pre></div>
          </div>
        )}
      </div>
    </td>
  );
}

export default function StationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const sid = Number(id);
  const [station, setStation] = useState<Station | null>(null);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [deepResult, setDeepResult] = useState<ProbeResult | null>(null);
  const [probeHistory, setProbeHistory] = useState<BatchSummary[]>([]);
  const [deepHistory, setDeepHistory] = useState<BatchSummary[]>([]);
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
      const [r, dr, ph, dh] = await Promise.all([
        getLatestResult(sid).catch(() => null),
        getLatestDeepResult(sid).catch(() => null),
        getStationHistory(sid, 'probe').catch(() => ({ batches: [], page: 1, page_size: 20 })),
        getStationHistory(sid, 'deep').catch(() => ({ batches: [], page: 1, page_size: 20 })),
      ]);
      if (stale()) return;
      setResult(r); setDeepResult(dr); setProbeHistory(ph.batches); setDeepHistory(dh.batches);
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
    if (!catalog.length) { alert('请先获取模型列表'); return; }
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
            <h1 className="text-[18px] font-bold text-[var(--ink)]">站点不存在或无法访问</h1>
            <p className="mt-2 text-[13px] text-[var(--ink-faint)]">{err}</p>
            <Link to="/" className="button-primary mt-5">返回总览</Link>
          </section>
        </div>
      </div>
    );
  }
  if (!station) return <div className="flex h-full items-center justify-center text-sm text-[var(--ink-faint)]">加载中...</div>;

  const hasProbe = Boolean(result?.batch);
  const hasDeep = Boolean(deepResult?.batch);
  const history = view === 'deep' ? deepHistory : probeHistory;
  const searchLow = search.trim().toLowerCase();
  const filtered = searchLow ? catalog.filter(m => m.id.toLowerCase().includes(searchLow)) : catalog;
  const selCount = selected.size;
  const hasCat = catalog.length > 0;
  const busy = probing || deepMode !== null;
  const probeText = probing ? '探测中...' : hasCat ? `探测 ${selCount} 个模型` : loadingModels ? '获取中...' : '获取模型';
  const models = [...(active?.models ?? [])].sort((a, b) => Number(b.available) - Number(a.available) || a.model_id.localeCompare(b.model_id));
  const activeLabel = view === 'deep' ? '深度检测' : '普通探测';

  const toggle = (mid: string) => setSelected(p => { const n = new Set(p); n.has(mid) ? n.delete(mid) : n.add(mid); return n; });

  return (
    <div className="page-shell">
      <div className="page-inner">

        {/* ---- 站点标题 ---- */}
        <section className="panel hero-band">
          <div className="min-w-0">
            <div className="eyebrow"><Link to="/" className="transition hover:text-[var(--accent-light)]">Overview</Link></div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="page-title m-0">{station.name}</h1>
              <span className={`status-pill ${stBadge[station.status]}`}><span className={`h-1.5 w-1.5 rounded-full ${stDot[station.status]}`} />{stText[station.status]}</span>
            </div>
            <p className="mt-2 font-mono text-[12px] text-[var(--ink-faint)]">{station.base_url}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {station.official_url && <a href={station.official_url} target="_blank" rel="noreferrer" className="button-ghost">官网</a>}
            <span className="rounded-md border px-3 py-2 text-[12px] text-[var(--ink-dim)]" style={{ borderColor: 'var(--line)' }}>
              {station.schedule_enabled ? `每${station.schedule_interval_hours}h探测` : '定时关闭'}
            </span>
          </div>
        </section>

        <div className="detail-layout">
          {/* ---- 左侧操作区 ---- */}
          <aside className="sticky-pane space-y-4">
            <section className="panel overflow-hidden">
              <div className="border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
                <div className="eyebrow">Action</div>
                <h2 className="mt-1 text-[18px] font-bold text-[var(--ink)]">探测</h2>
                <p className="mt-1 text-[12px] text-[var(--ink-faint)]">{hasCat ? `${selCount}/${catalog.length} 已选` : '先获取模型列表'}</p>
              </div>
              <div className="space-y-3 p-5">
                <input value={search} onChange={e => setSearch(e.target.value)} className="input-base w-full font-mono text-[11px]" placeholder="搜索模型" disabled={!hasCat} />
                <div className="flex gap-2">
                  <button onClick={fetchModels} disabled={loadingModels || busy} className="button-ghost flex-1">{loadingModels ? '获取中' : hasCat ? '刷新' : '获取模型'}</button>
                  <button onClick={() => setSelected(new Set(catalog.map(m => m.id)))} disabled={!hasCat || busy} className="button-ghost flex-1">全选</button>
                  <button onClick={() => setSelected(new Set())} disabled={!hasCat || busy} className="button-ghost flex-1">清空</button>
                </div>
                <button onClick={doProbe} disabled={busy || loadingModels || (hasCat && selCount === 0)} className="button-primary h-10 w-full">{probeText}</button>
              </div>
              <div className="border-t px-5 py-4" style={{ borderColor: 'var(--line)' }}>
                <div className="mb-2 text-[12px] font-bold text-[var(--ink)]">深度检测</div>
                <div className="flex gap-2">
                  {(['quick', 'standard', 'full'] as DetectionMode[]).map(m => (
                    <button key={m} onClick={() => doDeep(m)} disabled={busy || loadingModels || !hasCat || selCount === 0} className="button-ghost flex-1">
                      {deepMode === m ? '运行中' : modeLabel[m]}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel overflow-hidden">
              <div className="border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
                <h2 className="text-[13px] font-bold text-[var(--ink)]">模型列表</h2>
              </div>
              {modelErr ? (
                <div className="px-5 py-4 text-[12px] text-[var(--bad-light)]">{modelErr}</div>
              ) : filtered.length > 0 ? (
                <div className="max-h-[400px] overflow-y-auto">
                  {filtered.map(m => {
                    const checked = selected.has(m.id);
                    return (
                      <label key={m.id} className="data-row cursor-pointer items-start">
                        <input type="checkbox" checked={checked} onChange={() => toggle(m.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[12px] font-semibold text-[var(--ink)]">{m.id}</span>
                          <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--ink-faint)]">{fmtPricing(m.pricing)}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="px-5 py-10 text-center text-[13px] text-[var(--ink-faint)]">
                  {loadingModels ? '获取中...' : '点击上方获取模型'}
                </div>
              )}
            </section>
          </aside>

          {/* ---- 右侧结果 ---- */}
          <div className="min-w-0 space-y-5">
            <section className="panel p-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="eyebrow">Result</div>
                  <h2 className="mt-1 text-[20px] font-black text-[var(--ink)]">{activeLabel}</h2>
                  <p className="mt-0.5 text-[12px] text-[var(--ink-faint)]">
                    {active?.batch ? fmtTime(active.batch.probed_at) : loadingRes ? '读取中...' : '暂无记录'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setView('probe')} disabled={!hasProbe} className={`button-ghost ${view === 'probe' ? 'border-[var(--accent)] text-[var(--accent-light)]' : ''}`}>探测</button>
                  <button onClick={() => setView('deep')} disabled={!hasDeep} className={`button-ghost ${view === 'deep' ? 'border-[var(--accent)] text-[var(--accent-light)]' : ''}`}>深度</button>
                  {active?.batch && <Link to={`/stations/${sid}/probe/${active.batch.id}`} className="button-primary">完整详情</Link>}
                </div>
              </div>
              {active?.batch && (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <span className="status-pill bg-[var(--ok-dim)] text-[var(--ok-light)]">可用 {active.batch.available_models}</span>
                  <span className="status-pill bg-[var(--bad-dim)] text-[var(--bad-light)]">不可用 {active.batch.unavailable_models}</span>
                  <span className="status-pill bg-[var(--surface-2)] text-[var(--ink-dim)]">共 {active.batch.total_models}</span>
                  <span className="status-pill bg-[var(--accent-dim)] text-[var(--accent-light)]">{active.batch.duration_ms}ms</span>
                </div>
              )}
            </section>

            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
                <div>
                  <div className="eyebrow">History</div>
                  <h2 className="mt-1 text-[13px] font-bold text-[var(--ink)]">历史记录</h2>
                </div>
                <span className="font-mono text-[11px] text-[var(--ink-faint)]">{loadingRes ? '...' : `${history.length} 条`}</span>
              </div>
              {history.length > 0 ? (
                <div>
                  {history.slice(0, 10).map(b => (
                    <Link key={b.id} to={`/stations/${sid}/probe/${b.id}`} className="data-row">
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-[12px] font-bold text-[var(--ink)]">#{b.id} {b.batch_type === 'deep' ? '深度' : '探测'}</span>
                        <span className="mt-0.5 block font-mono text-[11px] text-[var(--ink-faint)]">{fmtTime(b.probed_at)}</span>
                      </span>
                      <span className="hidden text-right text-[12px] text-[var(--ink-dim)] sm:block">
                        {b.available_models}/{b.total_models}
                        <span className="mt-0.5 block font-mono text-[11px] text-[var(--ink-faint)]">{b.duration_ms}ms</span>
                      </span>
                      <span className="button-ghost min-h-0 px-3 py-1 text-xs">详情</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-8 text-center text-[13px] text-[var(--ink-faint)]">
                  {loadingRes ? '读取中...' : '暂无记录'}
                </div>
              )}
            </section>

            {models.length > 0 ? (
              <section className="panel overflow-x-auto">
                <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
                  <h2 className="text-[13px] font-bold text-[var(--ink)]">模型结果</h2>
                  <span className="font-mono text-[11px] text-[var(--ink-faint)]">{models.length} 个</span>
                </div>
                <table className="w-full min-w-[700px] text-left">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
                      <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">模型</th>
                      <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">状态</th>
                      <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">TTFT</th>
                      <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">信号</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map(m => {
                      const flags = parseFlags(m.degradation_flags);
                      const caps = parseCapabilityFlags(m.degradation_flags);
                      const attempts = parseAttempts(m.response_body);
                      const diag = diagnosticStatusLabel(flags, m.authenticity_score, m.available, attempts);
                      const isExpanded = expanded === m.id;
                      return (
                        <Fragment key={m.id}>
                          <tr className="cursor-pointer border-t transition hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--line)' }} onClick={() => setExpanded(isExpanded ? null : m.id)}>
                            <td className="px-5 py-3 font-mono text-[12px] font-semibold text-[var(--ink)]">{m.model_id}</td>
                            <td className="px-5 py-3">
                              <span className={`status-pill ${m.available ? 'bg-[var(--ok-dim)] text-[var(--ok-light)]' : 'bg-[var(--bad-dim)] text-[var(--bad-light)]'}`}>{m.available ? '可用' : '不可用'}</span>
                            </td>
                            <td className="px-5 py-3 font-mono text-[12px] text-[var(--ink-dim)]">{m.available ? `${m.ttft_ms}ms` : '-'}</td>
                            <td className="px-5 py-3">
                              {flags.length > 0 || caps.length > 0 || diag ? (
                                <div className="flex flex-wrap gap-1">
                                  {diag && <span className="status-pill bg-[var(--ok-dim)] text-[var(--ok-light)]">{diag}</span>}
                                  {flags.map(f => <span key={f} className="status-pill bg-[var(--warn-dim)] text-[var(--warn-light)]">{degradationFlagLabel[f] ?? f}</span>)}
                                  {caps.map(c => <span key={c} className="status-pill bg-[var(--info-dim)] text-[var(--info-light)]">{capabilityFlagLabel[c] ?? c}</span>)}
                                </div>
                              ) : <span className="text-[12px] text-[var(--ink-faint)]">-</span>}
                            </td>
                          </tr>
                          {m.error_message && <tr className="border-t" style={{ borderColor: 'var(--line)' }}><td colSpan={4} className="px-5 py-2 text-[12px] text-[var(--bad-light)]">{m.error_message}</td></tr>}
                          {isExpanded && <tr className="border-t" style={{ borderColor: 'var(--line)' }}><ModelExpand model={m} /></tr>}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ) : (
              <section className="panel px-6 py-16 text-center">
                <h2 className="text-[16px] font-bold text-[var(--ink)]">{loadingRes ? '读取中...' : `暂无${activeLabel}结果`}</h2>
                <p className="mt-2 text-[13px] text-[var(--ink-faint)]">选择模型后运行探测。</p>
                <button onClick={doProbe} disabled={busy || loadingModels || (hasCat && selCount === 0)} className="button-primary mt-5">{probeText}</button>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
