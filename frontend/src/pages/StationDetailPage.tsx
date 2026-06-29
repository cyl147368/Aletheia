import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getLatestResult, getStation, getStationModels, triggerProbe, type DetectionMode, type ModelCatalogItem, type ModelPricing, type ProbeResult, type Station } from '../api';
import {
  capabilityFlagLabel,
  degradationFlagLabel,
  diagnosticStatusLabel,
  parseAttempts,
  parseCapabilityFlags,
  parseFlags,
  endpointLabel,
  attemptRole,
  formatJson,
  formatRequestRecord,
  parseRequests,
} from '../utils/probeDisplay';

const statusText: Record<string, string> = { ok: '正常', degraded: '部分故障', down: '宕机', unknown: '未探测' };
const statusBadge: Record<string, string> = {
  ok: 'bg-[var(--ok-dim)] text-[var(--ok-light)]',
  degraded: 'bg-[var(--warn-dim)] text-[var(--warn-light)]',
  down: 'bg-[var(--bad-dim)] text-[var(--bad-light)]',
  unknown: 'bg-[var(--surface-2)] text-[var(--ink-dim)]',
};
const detectionModeLabel: Record<DetectionMode, string> = {
  quick: '快速',
  standard: '标准',
  full: '完整',
};

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel px-3 py-2" style={{ borderRadius: 8 }}>
      <div className="font-mono text-[11px] text-[var(--ink-faint)]">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-[var(--accent-light)]">{payload[0].value}ms</div>
    </div>
  );
}

function formatPrice(value?: number) {
  if (value === undefined) return null;
  if (value === 0) return '0';
  if (Math.abs(value) < 0.0001) return value.toExponential(2);
  return `${value}`;
}

function formatPricing(pricing: ModelPricing | null) {
  if (!pricing) return '—';
  const parts = [
    ['In', pricing.prompt],
    ['Out', pricing.completion],
    ['Req', pricing.request],
  ].flatMap(([label, value]) => {
    const formatted = formatPrice(value as number | undefined);
    return formatted ? [`${label} ${formatted}`] : [];
  });
  const suffix = [pricing.currency, pricing.unit].filter(Boolean).join('/');
  if (parts.length === 0) return '—';
  const source = pricing.source === 'site' ? '站点价格' : pricing.source === 'official_estimate' ? '官方估算' : '价格';
  const price = suffix ? `${parts.join(' · ')} ${suffix}` : parts.join(' · ');
  return `${source} · ${price}`;
}

function formatProbeTime(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

function ModelExpandRow({ model }: { model: NonNullable<ProbeResult>['models'][number] }) {
  const attempts = parseAttempts(model.response_body);
  const requests = parseRequests(model.request_body);

  return (
    <td colSpan={6} className="px-5 py-4" style={{ background: 'var(--surface-2)' }}>
      <div className="space-y-2.5">
        {attempts.length > 0 ? attempts.map((attempt, idx) => {
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
        }) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">请求体</div>
              <pre className="max-h-48 overflow-auto rounded-lg border p-3 text-xs leading-5 font-mono" style={{ borderColor: 'var(--line)', background: 'var(--bg)', color: 'var(--ink-dim)' }}>{formatJson(model.request_body)}</pre>
            </div>
            <div>
              <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">响应体</div>
              <pre className="max-h-48 overflow-auto rounded-lg border p-3 text-xs leading-5 font-mono" style={{ borderColor: 'var(--line)', background: 'var(--bg)', color: 'var(--ink-dim)' }}>{formatJson(model.response_body)}</pre>
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
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogItem[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelLoadError, setModelLoadError] = useState('');
  const [probing, setProbing] = useState(false);
  const [deepDetectingMode, setDeepDetectingMode] = useState<DetectionMode | null>(null);
  const [expandedModel, setExpandedModel] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([getStation(stationId), getLatestResult(stationId)]);
      setStation(s);
      setResult(r);
    } catch {
      setStation(await getStation(stationId));
      setResult(null);
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

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchModels(); }, [fetchModels]);

  const handleProbe = async () => {
    if (modelCatalog.length === 0) {
      await fetchModels();
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
    } finally {
      setProbing(false);
    }
  };

  const handleDeepDetection = async (mode: DetectionMode) => {
    if (modelCatalog.length === 0) {
      await fetchModels();
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
    } finally {
      setDeepDetectingMode(null);
    }
  };

  if (!station) return <div className="flex h-full items-center justify-center text-sm text-[var(--ink-faint)]">加载中...</div>;

  const ttftData = result?.models?.filter((m) => m.available).map((m) => ({
    model: m.model_id.split('/').pop() || m.model_id,
    ttft: m.ttft_ms,
  })) ?? [];
  const latestModels = result?.models ?? [];
  const normalizedSearch = modelSearch.trim().toLowerCase();
  const filteredCatalog = normalizedSearch
    ? modelCatalog.filter((model) => model.id.toLowerCase().includes(normalizedSearch))
    : modelCatalog;
  const selectedCount = selectedModelIds.size;
  const hasModelCatalog = modelCatalog.length > 0;
  const probeButtonText = probing
    ? '探测中...'
    : hasModelCatalog
      ? `探测选中 ${selectedCount}`
      : loadingModels
        ? '获取中...'
        : '获取模型';
  const isBusy = probing || deepDetectingMode !== null;

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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-7 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-3">
          <Link to="/" className="text-[11px] font-mono text-[var(--ink-faint)] transition hover:text-[var(--accent-light)]">看板</Link>
          <span className="text-[var(--line-soft)]">/</span>
          <span className="text-[16px] font-bold text-[var(--ink)]">{station.name}</span>
          <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${statusBadge[station.status]}`}>
            {statusText[station.status]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-[var(--ink-faint)] mr-2">
            {station.schedule_enabled ? `每 ${station.schedule_interval_hours}h 探测` : '定时关闭'}
          </span>
          <button
            onClick={handleProbe}
            disabled={isBusy || loadingModels || (hasModelCatalog && selectedCount === 0)}
            className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            style={{ background: 'var(--accent)', border: 'none' }}
          >
            {probeButtonText}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-7">
        {/* Station info */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg" style={{ background: 'var(--surface-2)', color: 'var(--accent-light)' }}>
            {station.name[0].toUpperCase()}
          </div>
          <div>
            <div className="font-mono text-[12px] text-[var(--ink-dim)]">{station.base_url}</div>
            {station.official_url && (
              <a href={station.official_url} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-[var(--accent-light)] transition hover:brightness-125">官网 ↗</a>
            )}
          </div>
        </div>

        <div className="panel mb-6 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3" style={{ borderColor: 'var(--line)' }}>
            <div>
              <div className="text-[12px] font-semibold text-[var(--ink)]">模型选择</div>
              <div className="mt-0.5 text-[10px] font-mono text-[var(--ink-faint)]">
                {hasModelCatalog ? `${selectedCount}/${modelCatalog.length} selected` : '先获取模型列表'}
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <input
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                className="input-base h-8 w-56 font-mono text-[11px]"
                placeholder="搜索模型"
              />
              <button
                onClick={fetchModels}
                disabled={loadingModels || isBusy}
                className="h-8 rounded-lg border px-3 text-[11px] font-semibold transition hover:border-[var(--accent)] hover:text-[var(--accent-light)] disabled:opacity-50"
                style={{ borderColor: 'var(--line-soft)', color: 'var(--ink-dim)', background: 'transparent' }}
              >
                {loadingModels ? '获取中...' : '刷新'}
              </button>
              <button
                onClick={selectAllModels}
                disabled={!hasModelCatalog || isBusy}
                className="h-8 rounded-lg border px-3 text-[11px] font-semibold transition hover:border-[var(--accent)] hover:text-[var(--accent-light)] disabled:opacity-50"
                style={{ borderColor: 'var(--line-soft)', color: 'var(--ink-dim)', background: 'transparent' }}
              >
                全选
              </button>
              <button
                onClick={clearModels}
                disabled={!hasModelCatalog || isBusy}
                className="h-8 rounded-lg border px-3 text-[11px] font-semibold transition hover:border-[var(--accent)] hover:text-[var(--accent-light)] disabled:opacity-50"
                style={{ borderColor: 'var(--line-soft)', color: 'var(--ink-dim)', background: 'transparent' }}
              >
                清空
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3" style={{ borderColor: 'var(--line)' }}>
            <div className="min-w-40">
              <div className="text-[12px] font-semibold text-[var(--ink)]">Veridrop 深度检测</div>
              <div className="mt-0.5 text-[10px] font-mono text-[var(--ink-faint)]">针对已选模型运行真伪/能力/协议检测</div>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              {(['quick', 'standard', 'full'] as DetectionMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleDeepDetection(mode)}
                  disabled={isBusy || loadingModels || !hasModelCatalog || selectedCount === 0}
                  className="h-8 rounded-lg border px-3 text-[11px] font-semibold transition hover:border-[var(--accent)] hover:text-[var(--accent-light)] disabled:opacity-50"
                  style={{ borderColor: 'var(--line-soft)', color: 'var(--ink-dim)', background: 'transparent' }}
                >
                  {deepDetectingMode === mode ? `${detectionModeLabel[mode]}检测中...` : `${detectionModeLabel[mode]}检测`}
                </button>
              ))}
            </div>
          </div>
          {modelLoadError ? (
            <div className="px-5 py-4 text-[12px] text-[var(--bad-light)]">{modelLoadError}</div>
          ) : filteredCatalog.length > 0 ? (
            <div className="max-h-[320px] overflow-y-auto">
              {filteredCatalog.map((model) => {
                const checked = selectedModelIds.has(model.id);
                return (
                  <label
                    key={model.id}
                    className="flex items-center gap-3 border-b px-5 py-3 transition hover:bg-[var(--surface-2)]"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleModel(model.id)}
                      className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium text-[var(--ink)]">{model.id}</span>
                    <span className="max-w-[360px] truncate font-mono text-[10px] text-[var(--ink-faint)]">{formatPricing(model.pricing)}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-[12px] text-[var(--ink-faint)]">
              {loadingModels ? '正在获取模型列表...' : '暂无模型'}
            </div>
          )}
        </div>

        {/* Stats */}
        {result?.batch && (
          <>
            <p className="mb-3 text-[12px] font-mono text-[var(--ink-faint)]">
              检测时间：{formatProbeTime(result.batch.probed_at)}
            </p>
            <div className="grid grid-cols-4 gap-3 mb-6">
              {[
                { label: '模型总数', value: result.batch.total_models, color: 'var(--ink)' },
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
          </>
        )}

        {/* TTFT Chart */}
        {ttftData.length > 1 && (
          <div className="panel mb-6">
            <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              <span className="text-[12px] font-semibold text-[var(--ink)]">TTFT 分布</span>
            </div>
            <div className="h-[280px] p-5">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ttftData}>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="model" tick={{ fontSize: 10, fill: 'var(--ink-faint)' }} angle={-18} textAnchor="end" height={58} stroke="var(--chart-grid)" />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--ink-faint)' }} stroke="var(--chart-grid)" />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--chart-grid)' }} />
                  <Line type="monotone" dataKey="ttft" stroke="var(--accent-light)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent-light)' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Model Table */}
        {latestModels.length > 0 ? (
          <div className="panel overflow-x-auto">
            <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok-light)]" />
              <span className="text-[12px] font-semibold text-[var(--ink)]">模型结果</span>
              <span className="text-[10px] font-mono text-[var(--ink-faint)] ml-auto">{latestModels.length} models</span>
            </div>
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead style={{ background: 'var(--surface-2)' }}>
                <tr>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">模型</th>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">状态</th>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">TTFT</th>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">响应预览</th>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">错误</th>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">标签</th>
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
                        className="border-t transition hover:bg-[var(--surface)] cursor-pointer"
                        style={{ borderColor: 'var(--line)' }}
                        onClick={() => setExpandedModel(isExpanded ? null : model.id)}
                      >
                        <td className="px-5 py-3 font-mono text-[11px] text-[var(--ink)] font-medium">{model.model_id}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex min-w-14 justify-center rounded-full px-2 py-1 text-[10px] font-semibold ${model.available ? 'bg-[var(--ok-dim)] text-[var(--ok-light)]' : 'bg-[var(--bad-dim)] text-[var(--bad-light)]'}`}>
                            {model.available ? '可用' : '不可用'}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono text-[11px] text-[var(--ink-dim)]">{model.available ? `${model.ttft_ms}ms` : '—'}</td>
                        <td className="max-w-52 px-5 py-3 text-[11px] text-[var(--ink-faint)] truncate">{model.response_preview || '—'}</td>
                        <td className="max-w-52 px-5 py-3 text-[11px] text-[var(--bad-light)] truncate">{model.error_message || '—'}</td>
                        <td className="px-5 py-3">
                          {flags.length > 0 || capabilities.length > 0 || diagnosticStatus ? (
                            <div className="flex flex-wrap gap-1">
                              {diagnosticStatus && <span className="inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold bg-[var(--ok-dim)] text-[var(--ok-light)]">{diagnosticStatus}</span>}
                              {flags.map((f) => <span key={f} className="inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold bg-[var(--warn-dim)] text-[var(--warn-light)]">{degradationFlagLabel[f] ?? f}</span>)}
                              {capabilities.map((c) => <span key={c} className="inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold bg-[var(--info-dim)] text-[var(--info-light)]">{capabilityFlagLabel[c] ?? c}</span>)}
                            </div>
                          ) : <span className="text-[11px] text-[var(--ink-faint)]">—</span>}
                        </td>
                      </tr>
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
          </div>
        ) : (
          <div className="panel p-14 text-center">
            <p className="text-[13px] text-[var(--ink-faint)] mb-3">还没有探测记录</p>
            <button
              onClick={handleProbe}
              disabled={isBusy || loadingModels || (hasModelCatalog && selectedCount === 0)}
              className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              style={{ background: 'var(--accent)', border: 'none' }}
            >
              {probeButtonText}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
