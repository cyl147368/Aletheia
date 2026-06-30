import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLatestResult, listStations, type ProbeResult, type Station } from '../api';

const statusConfig: Record<string, { dot: string; badge: string; label: string }> = {
  ok: {
    dot: 'bg-[var(--ok-light)] text-[var(--ok-light)]',
    badge: 'bg-[var(--ok-dim)] text-[var(--ok-light)]',
    label: '正常',
  },
  degraded: {
    dot: 'bg-[var(--warn-light)] text-[var(--warn-light)]',
    badge: 'bg-[var(--warn-dim)] text-[var(--warn-light)]',
    label: '需关注',
  },
  down: {
    dot: 'bg-[var(--bad-light)] text-[var(--bad-light)]',
    badge: 'bg-[var(--bad-dim)] text-[var(--bad-light)]',
    label: '异常',
  },
  unknown: {
    dot: 'bg-[var(--ink-faint)] text-[var(--ink-faint)]',
    badge: 'bg-[var(--surface-2)] text-[var(--ink-dim)]',
    label: '未探测',
  },
};

const statusRank: Record<Station['status'], number> = {
  down: 0,
  degraded: 1,
  unknown: 2,
  ok: 3,
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '暂无记录';
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

      const stationInfo: AvailableModelStation = {
        id: station.id,
        name: station.name,
        status: station.status,
        probedAt: result.batch.probed_at,
        ttftMs: model.ttft_ms,
      };
      const existing = groups.get(model.model_id);

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
    const speedDelta = Math.min(...a.stations.map((station) => station.ttftMs)) - Math.min(...b.stations.map((station) => station.ttftMs));
    if (speedDelta !== 0) return speedDelta;
    return a.modelId.localeCompare(b.modelId);
  });
}

function healthLabel(stations: Station[]) {
  if (stations.length === 0) return { label: '未配置站点', config: statusConfig.unknown };
  if (stations.some((station) => station.status === 'down')) return { label: '存在异常站点', config: statusConfig.down };
  if (stations.some((station) => station.status === 'degraded')) return { label: '部分站点需关注', config: statusConfig.degraded };
  if (stations.some((station) => station.status === 'unknown')) return { label: '部分站点未探测', config: statusConfig.unknown };
  return { label: '全部站点正常', config: statusConfig.ok };
}

export default function DashboardPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [results, setResults] = useState<Record<number, ProbeResult | null>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const nextStations = await listStations();
      const nextResults: Record<number, ProbeResult | null> = {};

      await Promise.all(nextStations.map(async (station) => {
        try {
          nextResults[station.id] = await getLatestResult(station.id);
        } catch {
          nextResults[station.id] = null;
        }
      }));

      setStations(nextStations);
      setResults(nextResults);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-[var(--ink-faint)]">加载中...</div>;
  }

  const availableModelGroups = buildAvailableModelGroups(stations, results);
  const routeCount = availableModelGroups.reduce((sum, group) => sum + group.stations.length, 0);
  const totalModels = Object.values(results).reduce((sum, result) => sum + (result?.batch?.total_models ?? 0), 0);
  const availableModels = Object.values(results).reduce((sum, result) => sum + (result?.batch?.available_models ?? 0), 0);
  const sortedStations = [...stations].sort((a, b) => {
    const rankDelta = statusRank[a.status] - statusRank[b.status];
    if (rankDelta !== 0) return rankDelta;
    return (b.last_probe_at ? new Date(b.last_probe_at).getTime() : 0) - (a.last_probe_at ? new Date(a.last_probe_at).getTime() : 0);
  });
  const health = healthLabel(stations);

  return (
    <div className="page-shell">
      <div className="page-inner">
        <section className="home-command mb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`status-dot ${health.config.dot}`} />
              <span className="eyebrow">Available Routes</span>
            </div>
            <h1 className="mt-5 max-w-3xl text-[36px] font-black leading-tight text-[var(--ink)]">
              可用模型及渠道
            </h1>
            <p className="mt-4 max-w-2xl text-[14px] leading-7 text-[var(--ink-dim)]">
              基于每个站点最新一次探测结果，直接展示哪个模型可用、来自哪个渠道、响应速度如何。
            </p>
          </div>

          <div className="route-scoreboard">
            <div className="route-score">
              <span className="route-score-value">{availableModelGroups.length}</span>
              <span className="route-score-label">可用模型</span>
            </div>
            <div className="route-score">
              <span className="route-score-value">{routeCount}</span>
              <span className="route-score-label">可用渠道</span>
            </div>
            <div className="route-score">
              <span className="route-score-value">{stations.length}</span>
              <span className="route-score-label">站点</span>
            </div>
          </div>
        </section>

        <section className="compact-status mb-5">
          <span className={`status-pill ${health.config.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${health.config.dot}`} />
            {health.label}
          </span>
          <span className="text-[12px] text-[var(--ink-faint)]">模型可用率 {availableModels}/{totalModels || 0}</span>
          {(['ok', 'degraded', 'down', 'unknown'] as Station['status'][]).map((status) => {
            const config = statusConfig[status];
            const count = stations.filter((station) => station.status === status).length;
            return (
              <span key={status} className={`status-pill ${config.badge}`}>
                {config.label} {count}
              </span>
            );
          })}
          <button type="button" onClick={fetchData} className="button-ghost ml-auto">刷新</button>
          <Link to="/manage" className="button-ghost">管理站点</Link>
        </section>

        <div className="home-route-layout">
          <section className="panel route-board overflow-hidden">
            <div className="route-board-head">
              <div>
                <div className="eyebrow">Matrix</div>
                <h2 className="mt-1 text-[18px] font-black text-[var(--ink)]">模型 - 渠道矩阵</h2>
              </div>
              <span className="font-mono text-[11px] text-[var(--ink-faint)]">{availableModelGroups.length} models · {routeCount} routes</span>
            </div>

            {availableModelGroups.length === 0 ? (
              <div className="route-empty">
                <h3 className="text-[17px] font-bold text-[var(--ink)]">暂无可用模型数据</h3>
                <p className="mt-2 max-w-md text-[13px] leading-6 text-[var(--ink-faint)]">
                  完成一次站点探测后，这里会直接展示模型、来源渠道和 TTFT。
                </p>
                <Link to="/manage" className="button-primary mt-5">添加或检查站点</Link>
              </div>
            ) : (
              <div className="route-model-list">
                {availableModelGroups.map((group) => {
                  const fastest = Math.min(...group.stations.map((station) => station.ttftMs));
                  const sortedSources = [...group.stations].sort((a, b) => a.ttftMs - b.ttftMs);

                  return (
                    <article key={group.modelId} className="route-model-row">
                      <div className="route-model-main">
                        <div className="min-w-0">
                          <h3 className="truncate font-mono text-[15px] font-black text-[var(--ink)]">{group.modelId}</h3>
                          <p className="mt-1 text-[11px] text-[var(--ink-faint)]">最近探测 {timeAgo(group.latestProbeAt)}</p>
                        </div>
                        <div className="route-model-meta">
                          <span className="status-pill bg-[var(--ok-dim)] text-[var(--ok-light)]">{group.stations.length} 渠道</span>
                          <span className="status-pill bg-[var(--accent-dim)] text-[var(--accent-light)]">最快 {fastest}ms</span>
                        </div>
                      </div>

                      <div className="channel-strip">
                        {sortedSources.map((station) => {
                          const config = statusConfig[station.status] ?? statusConfig.unknown;
                          return (
                            <Link
                              key={`${group.modelId}-${station.id}`}
                              to={`/stations/${station.id}`}
                              className="channel-card"
                              title={`${station.name} · TTFT ${station.ttftMs}ms`}
                            >
                              <span className={`status-dot ${config.dot}`} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] font-bold text-[var(--ink)]">{station.name}</span>
                                <span className="mt-1 block font-mono text-[11px] text-[var(--ink-faint)]">{station.ttftMs}ms</span>
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <section className="panel overflow-hidden">
              <div className="border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
                <div className="eyebrow">Stations</div>
                <h2 className="mt-1 section-title">渠道来源</h2>
              </div>
              {sortedStations.length === 0 ? (
                <div className="px-5 py-10 text-center text-[13px] text-[var(--ink-faint)]">还没有站点。</div>
              ) : (
                <div>
                  {sortedStations.map((station) => {
                    const config = statusConfig[station.status] ?? statusConfig.unknown;
                    const batch = results[station.id]?.batch;
                    return (
                      <Link key={station.id} to={`/stations/${station.id}`} className="data-row">
                        <span className={`status-dot ${config.dot}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold text-[var(--ink)]">{station.name}</span>
                          <span className="mt-1 block truncate font-mono text-[10px] text-[var(--ink-faint)]">{station.base_url}</span>
                        </span>
                        <span className="text-right font-mono text-[11px] text-[var(--ink-dim)]">
                          {batch ? `${batch.available_models}/${batch.total_models}` : '-'}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="panel p-5">
              <div className="eyebrow">Reading</div>
              <h2 className="mt-2 text-[17px] font-black text-[var(--ink)]">怎么看</h2>
              <p className="mt-3 text-[13px] leading-7 text-[var(--ink-dim)]">
                左侧每一行是一个可用模型；行内的渠道卡片就是来源站点。点渠道进入站点页，可以继续查看探测详情和历史批次。
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
