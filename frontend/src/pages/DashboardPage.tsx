import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getRouteOverview, type ProbeResult, type StationSummary } from '../api';

const statusCfg: Record<string, { dot: string; badge: string; label: string }> = {
  ok:        { dot: 'bg-[var(--ok-light)]', badge: 'bg-[var(--ok-dim)] text-[var(--ok-light)]', label: '正常' },
  degraded:  { dot: 'bg-[var(--warn-light)]', badge: 'bg-[var(--warn-dim)] text-[var(--warn-light)]', label: '需关注' },
  down:      { dot: 'bg-[var(--bad-light)]', badge: 'bg-[var(--bad-dim)] text-[var(--bad-light)]', label: '异常' },
  unknown:   { dot: 'bg-[var(--ink-faint)]', badge: 'bg-[var(--surface-2)] text-[var(--ink-dim)]', label: '未探测' },
};

const statusRank: Record<StationSummary['status'], number> = { down: 0, degraded: 1, unknown: 2, ok: 3 };

function timeAgo(d: string | null): string {
  if (!d) return '暂无';
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}

interface StationInfo { id: number; name: string; status: StationSummary['status']; probedAt: string; ttftMs: number }
interface ModelGroup { modelId: string; stations: StationInfo[]; latestProbeAt: string }

function buildGroups(stations: StationSummary[], results: Record<number, ProbeResult | null>): ModelGroup[] {
  const byId = new Map(stations.map(s => [s.id, s]));
  const map = new Map<string, ModelGroup>();
  for (const [sid, r] of Object.entries(results)) {
    const s = byId.get(Number(sid));
    if (!s || !r?.batch) continue;
    for (const m of r.models) {
      if (!m.available) continue;
      const info: StationInfo = { id: s.id, name: s.name, status: s.status, probedAt: r.batch.probed_at, ttftMs: m.ttft_ms };
      const g = map.get(m.model_id);
      if (g) { g.stations.push(info); if (new Date(r.batch.probed_at) > new Date(g.latestProbeAt)) g.latestProbeAt = r.batch.probed_at; }
      else map.set(m.model_id, { modelId: m.model_id, stations: [info], latestProbeAt: r.batch.probed_at });
    }
  }
  return [...map.values()].sort((a, b) => b.stations.length - a.stations.length || Math.min(...a.stations.map(x => x.ttftMs)) - Math.min(...b.stations.map(x => x.ttftMs)) || a.modelId.localeCompare(b.modelId));
}

export default function DashboardPage() {
  const [stations, setStations] = useState<StationSummary[]>([]);
  const [results, setResults] = useState<Record<number, ProbeResult | null>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async (stale: () => boolean = () => false) => {
    setRefreshing(true);
    try {
      const ov = await getRouteOverview();
      if (stale()) return;
      setStations(ov.stations);
      setResults(Object.fromEntries(ov.results.map(r => [r.station_id, r])));
      setLoading(false);
    } catch { if (!stale()) { setStations([]); setResults({}); } }
    finally { if (!stale()) { setLoading(false); setRefreshing(false); } }
  }, []);

  useEffect(() => { let ignore = false; fetch(() => ignore); return () => { ignore = true; }; }, [fetch]);

  const groups = buildGroups(stations, results);
  const routeCount = groups.reduce((s, g) => s + g.stations.length, 0);
  const totalM = Object.values(results).reduce((s, r) => s + (r?.batch?.total_models ?? 0), 0);
  const availM = Object.values(results).reduce((s, r) => s + (r?.batch?.available_models ?? 0), 0);
  const sorted = [...stations].sort((a, b) => statusRank[a.status] - statusRank[b.status] || (b.last_probe_at ? +new Date(b.last_probe_at) : 0) - (a.last_probe_at ? +new Date(a.last_probe_at) : 0));

  const hasDown = stations.some(s => s.status === 'down');
  const hasDeg = stations.some(s => s.status === 'degraded');
  const hasUnk = stations.some(s => s.status === 'unknown');
  const healthLabel = stations.length === 0 ? '未配置站点' : hasDown ? '有站点异常' : hasDeg ? '部分需关注' : hasUnk ? '部分未探测' : '全部正常';
  const healthDot = stations.length === 0 ? statusCfg.unknown : hasDown ? statusCfg.down : hasDeg ? statusCfg.degraded : hasUnk ? statusCfg.unknown : statusCfg.ok;

  return (
    <div className="page-shell">
      <div className="page-inner">

        {/* ---- 顶部统计 ---- */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${healthDot.dot}`} />
            <span className="text-[13px] font-bold text-[var(--ink)]">{healthLabel}</span>
            {(['ok', 'degraded', 'down', 'unknown'] as const).map(st => {
              const n = stations.filter(s => s.status === st).length;
              if (!n) return null;
              return <span key={st} className={`status-pill ${statusCfg[st].badge}`}>{statusCfg[st].label} {n}</span>;
            })}
            <span className="text-[12px] text-[var(--ink-faint)]">可用率 {availM}/{totalM || 0}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => fetch()} disabled={refreshing} className="button-ghost">{refreshing ? '刷新中' : '刷新'}</button>
            <Link to="/manage" className="button-ghost">管理站点</Link>
          </div>
        </div>

        {/* ---- 统计卡片 ---- */}
        <div className="route-scoreboard mb-5">
          {([
            [loading ? '...' : groups.length, '可用模型'],
            [loading ? '...' : routeCount, '可用渠道'],
            [loading ? '...' : stations.length, '站点'],
          ] as const).map(([val, label]) => (
            <div key={label} className="route-score">
              <span className="route-score-value">{val}</span>
              <span className="route-score-label">{label}</span>
            </div>
          ))}
        </div>

        {/* ---- 主体 ---- */}
        <div className="home-route-layout">
          <section className="panel overflow-hidden">
            <div className="route-board-head">
              <div>
                <div className="eyebrow">Matrix</div>
                <h2 className="mt-1 text-[18px] font-black text-[var(--ink)]">模型 - 渠道</h2>
              </div>
              <span className="font-mono text-[11px] text-[var(--ink-faint)]">{groups.length} models · {routeCount} routes</span>
            </div>

            {loading ? (
              <div className="route-empty">
                <h3 className="text-[17px] font-bold text-[var(--ink)]">加载中...</h3>
                <p className="mt-2 text-[13px] text-[var(--ink-faint)]">正在读取最新的探测结果。</p>
              </div>
            ) : groups.length === 0 ? (
              <div className="route-empty">
                <h3 className="text-[17px] font-bold text-[var(--ink)]">暂无可用模型</h3>
                <p className="mt-2 text-[13px] text-[var(--ink-faint)]">完成一次探测后，这里会显示可用模型和渠道。</p>
                {!refreshing && <Link to="/manage" className="button-primary mt-5">管理站点</Link>}
              </div>
            ) : (
              <div className="route-model-list">
                {groups.map(g => {
                  const fastest = Math.min(...g.stations.map(s => s.ttftMs));
                  const sortedSrc = [...g.stations].sort((a, b) => a.ttftMs - b.ttftMs);
                  return (
                    <article key={g.modelId} className="route-model-row">
                      <div className="route-model-main">
                        <div className="min-w-0">
                          <h3 className="truncate font-mono text-[14px] font-bold text-[var(--ink)]">{g.modelId}</h3>
                          <p className="mt-0.5 text-[11px] text-[var(--ink-faint)]">{timeAgo(g.latestProbeAt)}</p>
                        </div>
                        <div className="route-model-meta">
                          <span className="status-pill bg-[var(--ok-dim)] text-[var(--ok-light)]">{g.stations.length}</span>
                          <span className="status-pill bg-[var(--accent-dim)] text-[var(--accent-light)]">{fastest}ms</span>
                        </div>
                      </div>
                      <div className="channel-strip">
                        {sortedSrc.map(s => {
                          const cfg = statusCfg[s.status] ?? statusCfg.unknown;
                          return (
                            <Link key={`${g.modelId}-${s.id}`} to={`/stations/${s.id}`} className="channel-card" title={`${s.name} · ${s.ttftMs}ms`}>
                              <span className={`status-dot ${cfg.dot}`} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] font-bold text-[var(--ink)]">{s.name}</span>
                                <span className="mt-0.5 block font-mono text-[11px] text-[var(--ink-faint)]">{s.ttftMs}ms</span>
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
                <h2 className="mt-1 text-[13px] font-bold text-[var(--ink)]">站点列表</h2>
              </div>
              {sorted.length === 0 ? (
                <div className="px-5 py-10 text-center text-[13px] text-[var(--ink-faint)]">暂无站点</div>
              ) : (
                <div>{sorted.map(s => {
                  const cfg = statusCfg[s.status] ?? statusCfg.unknown;
                  const b = results[s.id]?.batch;
                  return (
                    <Link key={s.id} to={`/stations/${s.id}`} className="data-row">
                      <span className={`status-dot ${cfg.dot}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-[var(--ink)]">{s.name}</span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--ink-faint)]">{s.base_url}</span>
                      </span>
                      <span className="font-mono text-[11px] text-[var(--ink-dim)]">{b ? `${b.available_models}/${b.total_models}` : refreshing ? '...' : '-'}</span>
                    </Link>
                  );
                })}</div>
              )}
            </section>

            <section className="panel p-5">
              <div className="eyebrow">说明</div>
              <h2 className="mt-2 text-[17px] font-black text-[var(--ink)]">怎么看</h2>
              <p className="mt-3 text-[13px] leading-6 text-[var(--ink-dim)]">
                每行是一个可用模型，行内卡片是对应的来源站点。点击站点卡片进入详情页，查看探测记录和历史。
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
