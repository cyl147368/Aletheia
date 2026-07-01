import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getRouteOverview, type ProbeResult, type StationSummary } from '../api';

const statusCfg: Record<string, { dot: string; badge: string; label: string }> = {
  ok:        { dot: 'bg-[var(--ok-light)]', badge: 'bg-ok txt-ok', label: '正常' },
  degraded:  { dot: 'bg-[var(--warn-light)]', badge: 'bg-warn txt-warn', label: '需关注' },
  down:      { dot: 'bg-[var(--bad-light)]', badge: 'bg-bad txt-bad', label: '异常' },
  unknown:   { dot: 'bg-[var(--ink-faint)]', badge: 'bg-surface-2 txt-faint', label: '未探测' },
};

const statusRank: Record<StationSummary['status'], number> = { down: 0, degraded: 1, unknown: 2, ok: 3 };

function timeAgo(d: string | null): string {
  if (!d) return '';
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

        <div className="page-header">
          <div className="flex items-center gap-3">
            <span className={`status-dot ${healthDot.dot}`} />
            <div>
              <div className="eyebrow">Dashboard</div>
              <h1 className="page-title m-0">{healthLabel}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="stat-block"><span className="num">{loading ? '-' : availM}</span>/{totalM || 0} 可用</span>
            <span className="stat-block"><span className="num">{loading ? '-' : groups.length}</span> 模型</span>
            <span className="stat-block"><span className="num">{loading ? '-' : routeCount}</span> 渠道</span>
            <span className="stat-block"><span className="num">{loading ? '-' : stations.length}</span> 站点</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => fetch()} disabled={refreshing} className="button-ghost">{refreshing ? '刷新中' : '刷新'}</button>
            <Link to="/manage" className="button-ghost">管理</Link>
          </div>
        </div>

        {(['ok', 'degraded', 'down', 'unknown'] as const).map(st => {
          const n = stations.filter(s => s.status === st).length;
          if (!n) return null;
          return <span key={st} className={`status-pill ${statusCfg[st].badge}`}>{statusCfg[st].label} {n}</span>;
        })}

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <div className="eyebrow">Matrix</div>
              <h2 className="mt-1 text-[16px] font-bold text-[var(--ink)]">可用模型</h2>
            </div>
            <span className="txt-faint text-[12px]">{groups.length} 个模型 · {routeCount} 条渠道</span>
          </div>

          {loading ? (
            <div className="px-5 py-16 text-center"><p className="txt-faint">加载中...</p></div>
          ) : groups.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="txt-dim">暂无可用模型</p>
              {!refreshing && <Link to="/manage" className="button-primary mt-4">管理站点</Link>}
            </div>
          ) : (
            <div>
              {groups.map(g => {
                const fastest = Math.min(...g.stations.map(s => s.ttftMs));
                const sortedSrc = [...g.stations].sort((a, b) => a.ttftMs - b.ttftMs);
                return (
                  <div key={g.modelId}>
                    <div className="model-head">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-[13px] font-bold text-[var(--ink)]">{g.modelId}</span>
                        <span className="ml-3 txt-faint text-[11px]">{timeAgo(g.latestProbeAt)}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="stat-block">{g.stations.length}</span>
                        <span className="stat-block">{fastest}ms</span>
                      </div>
                    </div>
                    <div className="model-channels">
                      {sortedSrc.map(s => {
                        const cfg = statusCfg[s.status] ?? statusCfg.unknown;
                        return (
                          <Link key={`${g.modelId}-${s.id}`} to={`/stations/${s.id}`} className="channel-tag" title={`${s.name} · ${s.ttftMs}ms`}>
                            <span className={`status-dot ${cfg.dot}`} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] font-bold text-[var(--ink)]">{s.name}</span>
                              <span className="block font-mono text-[10px] txt-faint">{s.ttftMs}ms</span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel mt-5 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <div className="eyebrow">Stations</div>
              <h2 className="mt-1 text-[16px] font-bold text-[var(--ink)]">站点列表</h2>
            </div>
            <Link to="/manage" className="button-ghost">管理</Link>
          </div>
          {sorted.length === 0 ? (
            <div className="px-5 py-10 text-center txt-faint text-[13px]">暂无站点</div>
          ) : (
            <div>{sorted.map(s => {
              const cfg = statusCfg[s.status] ?? statusCfg.unknown;
              const b = results[s.id]?.batch;
              return (
                <Link key={s.id} to={`/stations/${s.id}`} className="data-row">
                  <span className={`status-dot ${cfg.dot}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-[var(--ink)]">{s.name}</span>
                    <span className="block truncate font-mono text-[10px] txt-faint">{s.base_url}</span>
                  </span>
                  <span className="stat-block">{b ? `${b.available_models}/${b.total_models}` : refreshing ? '...' : '-'}</span>
                </Link>
              );
            })}</div>
          )}
        </section>

      </div>
    </div>
  );
}
