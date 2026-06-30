import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getLatestDeepResult,
  getLatestResult,
  getStation,
  getStationHistory,
  getStationModels,
  triggerProbe,
  type BatchSummary,
  type DetectionMode,
  type ModelCatalogItem,
  type ModelPricing,
  type ProbeResult,
  type Station,
} from '../api';
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

const statusText: Record<Station['status'], string> = {
  ok: '正常',
  degraded: '需关注',
  down: '异常',
  unknown: '未探测',
};

const statusBadge: Record<Station['status'], string> = {
  ok: 'bg-[var(--ok-dim)] text-[var(--ok-light)]',
  degraded: 'bg-[var(--warn-dim)] text-[var(--warn-light)]',
  down: 'bg-[var(--bad-dim)] text-[var(--bad-light)]',
  unknown: 'bg-[var(--surface-2)] text-[var(--ink-dim)]',
};

const statusDot: Record<Station['status'], string> = {
  ok: 'bg-[var(--ok-light)] text-[var(--ok-light)]',
  degraded: 'bg-[var(--warn-light)] text-[var(--warn-light)]',
  down: 'bg-[var(--bad-light)] text-[var(--bad-light)]',
  unknown: 'bg-[var(--ink-faint)] text-[var(--ink-faint)]',
};

const detectionModeLabel: Record<DetectionMode, string> = {
  quick: '快速',
  standard: '标准',
  full: '完整',
};

function formatPrice(value?: number) {
  if (value === undefined) return null;
  if (value === 0) return '0';
  if (Math.abs(value) < 0.0001) return value.toExponential(2);
  return `${value}`;
}

function formatPricing(pricing: ModelPricing | null) {
  if (!pricing) return '无价格';
  const parts = [
    ['In', pricing.prompt],
    ['Out', pricing.completion],
    ['Req', pricing.request],
  ].flatMap(([label, value]) => {
    const formatted = formatPrice(value as number | undefined);
    return formatted ? [`${label} ${formatted}`] : [];
  });
  const suffix = [pricing.currency, pricing.unit].filter(Boolean).join('/');
  if (parts.length === 0) return '无价格';
  const source = pricing.source === 'site' ? '站点价格' : pricing.source === 'official_estimate' ? '官方估算' : '价格';
  const price = suffix ? `${parts.join(' · ')} ${suffix}` : parts.join(' · ');
  return `${source} · ${price}`;
}

function formatProbeTime(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

function batchTypeLabel(type: BatchSummary['batch_type']) {
  return type === 'deep' ? '深度检测' : '普通探测';
}

function ModelExpandRow({ model }: { model: NonNullable<ProbeResult>['models'][number] }) {
  const attempts = parseAttempts(model.response_body);
  const requests = parseRequests(model.request_body);
  const veridropReport = parseVeridropReport(model.response_body);

  return (
    <td colSpan={4} className="px-5 py-4" style={{ background: 'var(--surface-2)' }}>
      <div className="space-y-3">
        {veridropReport ? (
          <VeridropReportPanel report={veridropReport} />
        ) : attempts.length > 0 ? attempts.map((attempt, idx) => {
          const req = requests[idx];
          return (
            <div key={`${attempt.endpoint}-${idx}`} className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--line)' }}>
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
        }) : (
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
    </td>
  );
}

export default function StationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const stationId = Number(id);
  const [station, setStation] = useState<Station | null>(null);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [deepResult, setDeepResult] = useState<ProbeResult | null>(null);
  const [probeHistory, setProbeHistory] = useState<BatchSummary[]>([]);
  const [deepHistory, setDeepHistory] = useState<BatchSummary[]>([]);
  const [resultView, setResultView] = useState<'probe' | 'deep'>('probe');
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogItem[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelLoadError, setModelLoadError] = useState('');
  const [probing, setProbing] = useState(false);
  const [deepDetectingMode, setDeepDetectingMode] = useState<DetectionMode | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [expandedModel, setExpandedModel] = useState<number | null>(null);

  const fetchData = useCallback(async (isStale: () => boolean = () => false) => {
    try {
      const nextStation = await getStation(stationId);
      if (isStale()) return;
      setStation(nextStation);
      setLoadingResults(true);

      const [nextResult, nextDeepResult, nextProbeHistory, nextDeepHistory] = await Promise.all([
        getLatestResult(stationId).catch(() => null),
        getLatestDeepResult(stationId).catch(() => null),
        getStationHistory(stationId, 'probe').catch(() => ({ batches: [], page: 1, page_size: 20 })),
        getStationHistory(stationId, 'deep').catch(() => ({ batches: [], page: 1, page_size: 20 })),
      ]);
      if (isStale()) return;

      setResult(nextResult);
      setDeepResult(nextDeepResult);
      setProbeHistory(nextProbeHistory.batches);
      setDeepHistory(nextDeepHistory.batches);

      if (!nextResult?.batch && nextDeepResult?.batch) {
        setResultView('deep');
      }
    } finally {
      if (!isStale()) {
        setLoadingResults(false);
      }
    }
  }, [stationId]);

  const fetchModels = useCallback(async () => {
    setLoadingModels(true);
    setModelLoadError('');
    try {
      const catalog = await getStationModels(stationId);
      setModelCatalog(catalog.models);
      setSelectedModelIds(new Set(catalog.models.map((model) => model.id)));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setModelLoadError(message || '获取模型列表失败');
      setModelCatalog([]);
      setSelectedModelIds(new Set());
    } finally {
      setLoadingModels(false);
    }
  }, [stationId]);

  useEffect(() => {
    let ignore = false;
    fetchData(() => ignore);
    return () => { ignore = true; };
  }, [fetchData]);

  const activeResult = resultView === 'deep' ? deepResult : result;

  useEffect(() => {
    setExpandedModel(activeResult?.models[0]?.id ?? null);
  }, [activeResult]);

  const handleProbe = async () => {
    if (modelCatalog.length === 0) {
      alert('请先点击「获取模型」手动读取模型列表');
      return;
    }
    const modelIds = Array.from(selectedModelIds);
    if (modelIds.length === 0) {
      alert('请至少选择一个模型');
      return;
    }
    setProbing(true);
    try {
      await triggerProbe(stationId, modelIds);
      await fetchData();
      setResultView('probe');
    } finally {
      setProbing(false);
    }
  };

  const handleDeepDetection = async (mode: DetectionMode) => {
    if (modelCatalog.length === 0) {
      alert('请先点击「获取模型」手动读取模型列表');
      return;
    }
    const modelIds = Array.from(selectedModelIds);
    if (modelIds.length === 0) {
      alert('请至少选择一个模型');
      return;
    }
    setDeepDetectingMode(mode);
    try {
      await triggerProbe(stationId, modelIds, mode);
      await fetchData();
      setResultView('deep');
    } finally {
      setDeepDetectingMode(null);
    }
  };

  if (!station) {
    return <div className="flex h-full items-center justify-center text-sm text-[var(--ink-faint)]">加载中...</div>;
  }

  const hasProbeResult = Boolean(result?.batch);
  const hasDeepResult = Boolean(deepResult?.batch);
  const history = resultView === 'deep' ? deepHistory : probeHistory;
  const normalizedSearch = modelSearch.trim().toLowerCase();
  const filteredCatalog = normalizedSearch
    ? modelCatalog.filter((model) => model.id.toLowerCase().includes(normalizedSearch))
    : modelCatalog;
  const selectedCount = selectedModelIds.size;
  const hasModelCatalog = modelCatalog.length > 0;
  const isBusy = probing || deepDetectingMode !== null;
  const probeButtonText = probing
    ? '探测中...'
    : hasModelCatalog
      ? `探测 ${selectedCount} 个模型`
      : loadingModels
        ? '获取中...'
        : '获取模型';
  const latestModels = [...(activeResult?.models ?? [])].sort((a, b) => Number(b.available) - Number(a.available) || a.model_id.localeCompare(b.model_id));
  const viewTitle = resultView === 'deep' ? '深度检测详情' : '普通探测详情';

  const toggleModel = (modelId: string) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const selectAllModels = () => {
    setSelectedModelIds(new Set(modelCatalog.map((model) => model.id)));
  };

  const clearModels = () => {
    setSelectedModelIds(new Set());
  };

  return (
    <div className="page-shell">
      <div className="page-inner">
        <section className="panel hero-band">
          <div className="min-w-0">
            <div className="eyebrow">
              <Link to="/" className="transition hover:text-[var(--accent-light)]">Overview</Link>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="page-title m-0">{station.name}</h1>
              <span className={`status-pill ${statusBadge[station.status]}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot[station.status]}`} />
                {statusText[station.status]}
              </span>
            </div>
            <p className="mt-3 truncate font-mono text-[12px] text-[var(--ink-faint)]">{station.base_url}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {station.official_url && (
              <a href={station.official_url} target="_blank" rel="noreferrer" className="button-ghost">官网</a>
            )}
            <span className="rounded-md border px-3 py-2 text-[12px] text-[var(--ink-dim)]" style={{ borderColor: 'var(--line)' }}>
              {station.schedule_enabled ? `每 ${station.schedule_interval_hours}h 探测` : '定时关闭'}
            </span>
          </div>
        </section>

        <div className="detail-layout">
          <aside className="sticky-pane space-y-4">
            <section className="panel overflow-hidden">
              <div className="border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
                <div className="eyebrow">Action</div>
                <h2 className="mt-2 text-[18px] font-bold text-[var(--ink)]">检测范围</h2>
                <p className="mt-2 text-[12px] leading-6 text-[var(--ink-faint)]">
                  {hasModelCatalog ? `${selectedCount}/${modelCatalog.length} 个模型已选择` : '页面进入仅展示历史；获取模型需手动点击'}
                </p>
              </div>

              <div className="space-y-3 p-5">
                <input
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  className="input-base w-full font-mono text-[11px]"
                  placeholder="搜索模型"
                  disabled={!hasModelCatalog}
                />
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={fetchModels} disabled={loadingModels || isBusy} className="button-ghost px-0">
                    {loadingModels ? '获取中' : hasModelCatalog ? '刷新模型' : '获取模型'}
                  </button>
                  <button type="button" onClick={selectAllModels} disabled={!hasModelCatalog || isBusy} className="button-ghost px-0">全选</button>
                  <button type="button" onClick={clearModels} disabled={!hasModelCatalog || isBusy} className="button-ghost px-0">清空</button>
                </div>
                <button
                  type="button"
                  onClick={handleProbe}
                  disabled={isBusy || loadingModels || (hasModelCatalog && selectedCount === 0)}
                  className="button-primary h-10 w-full"
                >
                  {probeButtonText}
                </button>
              </div>

              <div className="border-t px-5 py-4" style={{ borderColor: 'var(--line)' }}>
                <div className="mb-3 text-[12px] font-bold text-[var(--ink)]">深度检测</div>
                <div className="grid grid-cols-3 gap-2">
                  {(['quick', 'standard', 'full'] as DetectionMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleDeepDetection(mode)}
                      disabled={isBusy || loadingModels || !hasModelCatalog || selectedCount === 0}
                      className="button-ghost px-0"
                    >
                      {deepDetectingMode === mode ? '运行中' : detectionModeLabel[mode]}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel overflow-hidden">
              <div className="border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
                <h2 className="section-title">模型列表</h2>
              </div>
              {modelLoadError ? (
                <div className="px-5 py-4 text-[12px] text-[var(--bad-light)]">{modelLoadError}</div>
              ) : filteredCatalog.length > 0 ? (
                <div className="max-h-[420px] overflow-y-auto">
                  {filteredCatalog.map((model) => {
                    const checked = selectedModelIds.has(model.id);
                    return (
                      <label key={model.id} className="data-row cursor-pointer items-start">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleModel(model.id)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[12px] font-semibold text-[var(--ink)]">{model.id}</span>
                          <span className="mt-1 block truncate font-mono text-[10px] text-[var(--ink-faint)]">{formatPricing(model.pricing)}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="px-5 py-10 text-center text-[13px] text-[var(--ink-faint)]">
                  {loadingModels ? '正在获取模型列表...' : '点击「获取模型」后才会访问渠道模型接口。'}
                </div>
              )}
            </section>
          </aside>

          <div className="min-w-0">
            <section className="panel mb-5 p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="eyebrow">Result</div>
                  <h2 className="mt-2 text-[20px] font-black text-[var(--ink)]">{viewTitle}</h2>
                  <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
                    {activeResult?.batch ? formatProbeTime(activeResult.batch.probed_at) : loadingResults ? '正在读取检测记录...' : '暂无记录'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setResultView('probe')}
                    disabled={!hasProbeResult}
                    className={`button-ghost ${resultView === 'probe' ? 'border-[var(--accent)] text-[var(--accent-light)]' : ''}`}
                  >
                    普通探测
                  </button>
                  <button
                    type="button"
                    onClick={() => setResultView('deep')}
                    disabled={!hasDeepResult}
                    className={`button-ghost ${resultView === 'deep' ? 'border-[var(--accent)] text-[var(--accent-light)]' : ''}`}
                  >
                    深度检测
                  </button>
                  {activeResult?.batch && (
                    <Link to={`/stations/${stationId}/probe/${activeResult.batch.id}`} className="button-primary">查看完整详情</Link>
                  )}
                </div>
              </div>

              {activeResult?.batch && (
                <div className="mt-5 grid gap-2 sm:grid-cols-4">
                  <span className="status-pill bg-[var(--ok-dim)] text-[var(--ok-light)]">可用 {activeResult.batch.available_models}</span>
                  <span className="status-pill bg-[var(--bad-dim)] text-[var(--bad-light)]">不可用 {activeResult.batch.unavailable_models}</span>
                  <span className="status-pill bg-[var(--surface-2)] text-[var(--ink-dim)]">共 {activeResult.batch.total_models}</span>
                  <span className="status-pill bg-[var(--accent-dim)] text-[var(--accent-light)]">{activeResult.batch.duration_ms}ms</span>
                </div>
              )}
            </section>

            <section className="panel mb-5 overflow-hidden">
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
                <div>
                  <div className="eyebrow">History</div>
                  <h2 className="mt-1 section-title">探测详情</h2>
                </div>
                <span className="font-mono text-[11px] text-[var(--ink-faint)]">{loadingResults ? 'updating' : `${history.length} batches`}</span>
              </div>
              {history.length > 0 ? (
                <div>
                  {history.slice(0, 8).map((batch) => (
                    <Link key={batch.id} to={`/stations/${stationId}/probe/${batch.id}`} className="data-row">
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-[12px] font-bold text-[var(--ink)]">{batchTypeLabel(batch.batch_type)} #{batch.id}</span>
                        <span className="mt-1 block font-mono text-[11px] text-[var(--ink-faint)]">{formatProbeTime(batch.probed_at)}</span>
                      </span>
                      <span className="hidden text-right text-[12px] text-[var(--ink-dim)] sm:block">
                        {batch.available_models}/{batch.total_models} 可用
                        <span className="mt-1 block font-mono text-[11px] text-[var(--ink-faint)]">{batch.duration_ms}ms</span>
                      </span>
                      <span className="button-ghost min-h-0 px-3 py-1">详情</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-8 text-center text-[13px] text-[var(--ink-faint)]">
                  {loadingResults ? '正在读取历史记录...' : `暂无${resultView === 'deep' ? '深度检测' : '普通探测'}记录。完成一次检测后，这里会出现可点击的详情记录。`}
                </div>
              )}
            </section>

            {latestModels.length > 0 ? (
              <section className="panel overflow-x-auto">
                <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
                  <h2 className="section-title">模型结果</h2>
                  <span className="font-mono text-[11px] text-[var(--ink-faint)]">{latestModels.length} models</span>
                </div>
                <table className="w-full min-w-[820px] text-left">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
                      <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">模型</th>
                      <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">状态</th>
                      <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">TTFT</th>
                      <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">信号</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestModels.map((model) => {
                      const flags = parseFlags(model.degradation_flags);
                      const capabilities = parseCapabilityFlags(model.degradation_flags);
                      const attempts = parseAttempts(model.response_body);
                      const diagnosticStatus = diagnosticStatusLabel(flags, model.authenticity_score, model.available, attempts);
                      const isExpanded = expandedModel === model.id;

                      return (
                        <Fragment key={model.id}>
                          <tr
                            className="cursor-pointer border-t transition hover:bg-[var(--surface-2)]"
                            style={{ borderColor: 'var(--line)' }}
                            onClick={() => setExpandedModel(isExpanded ? null : model.id)}
                          >
                            <td className="px-5 py-3 font-mono text-[12px] font-semibold text-[var(--ink)]">{model.model_id}</td>
                            <td className="px-5 py-3">
                              <span className={`status-pill ${model.available ? 'bg-[var(--ok-dim)] text-[var(--ok-light)]' : 'bg-[var(--bad-dim)] text-[var(--bad-light)]'}`}>
                                {model.available ? '可用' : '不可用'}
                              </span>
                            </td>
                            <td className="px-5 py-3 font-mono text-[12px] text-[var(--ink-dim)]">{model.available ? `${model.ttft_ms}ms` : '-'}</td>
                            <td className="px-5 py-3">
                              {flags.length > 0 || capabilities.length > 0 || diagnosticStatus ? (
                                <div className="flex flex-wrap gap-1">
                                  {diagnosticStatus && <span className="status-pill bg-[var(--ok-dim)] text-[var(--ok-light)]">{diagnosticStatus}</span>}
                                  {flags.map((flag) => <span key={flag} className="status-pill bg-[var(--warn-dim)] text-[var(--warn-light)]">{degradationFlagLabel[flag] ?? flag}</span>)}
                                  {capabilities.map((capability) => <span key={capability} className="status-pill bg-[var(--info-dim)] text-[var(--info-light)]">{capabilityFlagLabel[capability] ?? capability}</span>)}
                                </div>
                              ) : (
                                <span className="text-[12px] text-[var(--ink-faint)]">无异常信号</span>
                              )}
                            </td>
                          </tr>
                          {model.error_message && (
                            <tr className="border-t" style={{ borderColor: 'var(--line)' }}>
                              <td colSpan={4} className="px-5 py-2 text-[12px] text-[var(--bad-light)]">{model.error_message}</td>
                            </tr>
                          )}
                          {isExpanded && (
                            <tr className="border-t" style={{ borderColor: 'var(--line)' }}>
                              <ModelExpandRow model={model} />
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ) : (
              <section className="panel px-6 py-16 text-center">
                <h2 className="text-[16px] font-bold text-[var(--ink)]">{loadingResults ? '正在读取模型结果' : `还没有${resultView === 'deep' ? '深度检测' : '普通探测'}记录`}</h2>
                <p className="mt-2 text-[13px] text-[var(--ink-faint)]">{loadingResults ? '结果加载完成后会直接显示在这里。' : '选择模型后运行一次检测，结果会显示在这里。'}</p>
                <button
                  type="button"
                  onClick={handleProbe}
                  disabled={isBusy || loadingModels || (hasModelCatalog && selectedCount === 0)}
                  className="button-primary mt-5"
                >
                  {probeButtonText}
                </button>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
