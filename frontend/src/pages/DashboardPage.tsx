import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOverview, getLatestResult, listStations, type Overview, type ProbeResult, type Station } from '../api';

const statusConfig: Record<string, { dot: string; badge: string; label: string }> = {
  ok:       { dot: 'bg-[var(--ok-light)]',   badge: 'bg-[var(--ok-dim)] text-[var(--ok-light)]',     label: '正常' },
  degraded: { dot: 'bg-[var(--warn-light)]', badge: 'bg-[var(--warn-dim)] text-[var(--warn-light)]', label: '部分故障' },
  down:     { dot: 'bg-[var(--bad-light)]',  badge: 'bg-[var(--bad-dim)] text-[var(--bad-light)]',   label: '宕机' },
  unknown:  { dot: 'bg-[var(--ink-faint)]',  badge: 'bg-[var(--surface-2)] text-[var(--ink-dim)]',   label: '未探测' },
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '暂无';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  return `${Math.floor(hrs / 24)} 天前`;
}

interface AvailableModelStation {
  id: number;
  name: string;
  status: Station['status'];
  probedAt: string;
  ttftMs: number;
}

interface AvailableModelGroup {
  modelId: string;
  stations: AvailableModelStation[];
  latestProbeAt: string;
}

function buildAvailableModelGroups(stations: Station[], results: Record<number, ProbeResult | null>): AvailableModelGroup[] {
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const groups = new Map<string, AvailableModelGroup>();

  for (const [stationIdText, result] of Object.entries(results)) {
    const station = stationById.get(Number(stationIdText));
    if (!station || !result?.batch) continue;

    for (const model of result.models) {
      if (!model.available) continue;
      const existing = groups.get(model.model_id);
      const stationInfo: AvailableModelStation = {
        id: station.id,
        name: station.name,
        status: station.status,
        probedAt: result.batch.probed_at,
        ttftMs: model.ttft_ms,
      };

      if (existing) {
        existing.stations.push(stationInfo);
        if (new Date(result.batch.probed_at).getTime() > new Date(existing.latestProbeAt).getTime()) {
          existing.latestProbeAt = result.batch.probed_at;
        }
      } else {
        groups.set(model.model_id, {
          modelId: model.model_id,
          stations: [stationInfo],
          latestProbeAt: result.batch.probed_at,
        });
      }
    }
  }

  return [...groups.values()].sort((a, b) => {
    const stationDelta = b.stations.length - a.stations.length;
    if (stationDelta !== 0) return stationDelta;
    return a.modelId.localeCompare(b.modelId);
  });
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [results, setResults] = useState<Record<number, ProbeResult | null>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, st] = await Promise.all([getOverview(), listStations()]);
      setOverview(ov);
      setStations(st);
      // Fetch latest results for each station
      const res: Record<number, ProbeResult | null> = {};
      await Promise.all(st.map(async (s) => {
        try { res[s.id] = await getLatestResult(s.id); } catch { res[s.id] = null; }
      }));
      setResults(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--ink-faint)]">
        加载中...
      </div>
    );
  }

  // Sort stations by last probe time (most recent first) for timeline
  const sortedStations = [...stations].sort((a, b) => {
    const ta = a.last_probe_at ? new Date(a.last_probe_at).getTime() : 0;
    const tb = b.last_probe_at ? new Date(b.last_probe_at).getTime() : 0;
    return tb - ta;
  });

  // Total models across all stations
  const totalModels = Object.values(results).reduce((sum, r) => sum + (r?.batch?.total_models ?? 0), 0);
  const availableModels = Object.values(results).reduce((sum, r) => sum + (r?.batch?.available_models ?? 0), 0);
  const unavailableModels = totalModels - availableModels;
  const availableModelGroups = buildAvailableModelGroups(stations, results);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-7 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <h1 className="text-[16px] font-bold tracking-tight text-[var(--ink)]">看板</h1>
        <button
          onClick={fetchData}
          className="px-3.5 py-1.5 rounded-lg border text-[12px] font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent-light)]"
          style={{ borderColor: 'var(--line-soft)', color: 'var(--ink-faint)', background: 'transparent' }}
        >
          ⟳ 刷新
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-7">
        {stations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--surface-2)' }}>
              <span className="text-2xl">📡</span>
            </div>
            <p className="text-[14px] font-semibold text-[var(--ink)] mb-1">还没有中转站</p>
            <p className="text-[12px] text-[var(--ink-faint)] mb-4">添加你的第一个中转站开始监控</p>
            <Link
              to="/manage"
              className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition hover:brightness-110"
              style={{ background: 'var(--accent)' }}
            >
              + 添加站点
            </Link>
          </div>
        ) : (
          <>
            {/* Health overview */}
            <div className="grid grid-cols-4 gap-3 mb-7">
              {[
                { label: '总站点', value: overview?.total ?? 0, color: 'var(--ink)' },
                { label: '可用模型', value: availableModels, color: 'var(--ok-light)' },
                { label: '不可用模型', value: unavailableModels, color: 'var(--bad-light)' },
                { label: '总模型数', value: totalModels, color: 'var(--accent-light)' },
              ].map((item) => (
                <div key={item.label} className="panel p-5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-faint)' }}>{item.label}</div>
                  <div className="text-[26px] font-extrabold tabular-nums tracking-tight" style={{ color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Available models */}
            <div className="panel mb-7 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3" style={{ borderColor: 'var(--line)' }}>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok-light)]" />
                  <span className="text-[12px] font-semibold text-[var(--ink)]">当前可用模型</span>
                </div>
                <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                  {availableModelGroups.length} models · {availableModels} routes
                </span>
              </div>
              {availableModelGroups.length > 0 ? (
                <div className="max-h-[360px] overflow-y-auto divide-y" style={{ borderColor: 'var(--line)' }}>
                  {availableModelGroups.map((group) => (
                    <div key={group.modelId} className="grid gap-3 px-5 py-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.65fr)_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[12px] font-semibold text-[var(--ink)]">{group.modelId}</div>
                        <div className="mt-1 text-[10px] text-[var(--ink-faint)]">最近检测 {timeAgo(group.latestProbeAt)}</div>
                      </div>
                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        {group.stations.map((station) => {
                          const config = statusConfig[station.status] ?? statusConfig.unknown;
                          return (
                            <Link
                              key={`${group.modelId}-${station.id}`}
                              to={`/stations/${station.id}`}
                              className={`inline-flex max-w-[220px] items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold transition hover:brightness-110 ${config.badge}`}
                              title={`${station.name} · TTFT ${station.ttftMs}ms · ${new Date(station.probedAt).toLocaleString('zh-CN')}`}
                            >
                              <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${config.dot}`} />
                              <span className="truncate">{station.name}</span>
                              <span className="font-mono opacity-75">{station.ttftMs}ms</span>
                            </Link>
                          );
                        })}
                      </div>
                      <div className="font-mono text-[11px] font-semibold tabular-nums text-[var(--ok-light)]">
                        {group.stations.length} 渠道
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-8 text-center text-[12px] text-[var(--ink-faint)]">
                  暂无可用模型，完成探测后会在这里显示模型和可用渠道
                </div>
              )}
            </div>

            {/* Two column: timeline + station overview */}
            <div className="grid grid-cols-[1fr_1fr] gap-5">
              {/* Timeline */}
              <div className="panel p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                  <span className="text-[12px] font-semibold text-[var(--ink)]">最近活动</span>
                </div>
                <div className="relative pl-5">
                  {/* Timeline line */}
                  <div className="absolute left-[5px] top-2 bottom-2 w-px" style={{ background: 'var(--line-soft)' }} />

                  {sortedStations.map((station) => {
                    const config = statusConfig[station.status] ?? statusConfig.unknown;
                    const result = results[station.id];
                    const batch = result?.batch;

                    return (
                      <div key={station.id} className="relative pb-5 last:pb-0">
                        <div className={`absolute -left-5 top-1.5 w-[11px] h-[11px] rounded-full border-2 ${config.dot}`} style={{ borderColor: 'var(--surface)', color: 'currentColor' }} />
                        <div className="text-[12px] text-[var(--ink-dim)] leading-relaxed">
                          <Link to={`/stations/${station.id}`} className="font-semibold text-[var(--ink)] hover:text-[var(--accent-light)] transition">
                            {station.name}
                          </Link>
                          {batch ? (
                            <> 探测完成 — {batch.available_models}/{batch.total_models} 模型可用，耗时 {batch.duration_ms}ms</>
                          ) : (
                            <> 还没有探测记录</>
                          )}
                        </div>
                        <div className="text-[10px] mt-1" style={{ color: 'var(--ink-faint)' }}>{timeAgo(station.last_probe_at)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Station overview */}
              <div className="panel p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok-light)]" />
                    <span className="text-[12px] font-semibold text-[var(--ink)]">站点状态</span>
                  </div>
                  <Link to="/manage" className="text-[11px] font-semibold text-[var(--accent-light)] hover:underline transition">管理 →</Link>
                </div>
                <div className="space-y-2">
                  {stations.map((station) => {
                    const config = statusConfig[station.status] ?? statusConfig.unknown;
                    const result = results[station.id];
                    const batch = result?.batch;

                    return (
                      <Link
                        key={station.id}
                        to={`/stations/${station.id}`}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition hover:bg-[var(--surface-2)] block"
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${config.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-[var(--ink)] truncate">{station.name}</div>
                        </div>
                        {batch && (
                          <span className="text-[11px] font-medium tabular-nums text-[var(--ink-dim)]">
                            <strong style={{ color: batch.available_models === batch.total_models ? 'var(--ok-light)' : 'var(--warn-light)' }}>
                              {batch.available_models}
                            </strong>
                            /{batch.total_models}
                          </span>
                        )}
                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${config.badge}`}>{config.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
