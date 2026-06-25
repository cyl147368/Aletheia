import { useEffect, useState, useCallback } from 'react';
import { triggerProbe, type Station, type Overview, type ProbeResult, type ModelResult } from '../api';

const statusConfig = {
  ok: { label: '正常', color: 'bg-green-500', bgLight: 'bg-green-50', textColor: 'text-green-700' },
  degraded: { label: '部分故障', color: 'bg-yellow-500', bgLight: 'bg-yellow-50', textColor: 'text-yellow-700' },
  down: { label: '宕机', color: 'bg-red-500', bgLight: 'bg-red-50', textColor: 'text-red-700' },
  unknown: { label: '未探测', color: 'bg-slate-400', bgLight: 'bg-slate-100', textColor: 'text-slate-500' },
};

function ModelRow({ model }: { model: ModelResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="border-t border-slate-100">
        <td className="px-4 py-2 font-mono text-slate-700">{model.model_id}</td>
        <td className="px-4 py-2 text-center">
          {model.available ? (
            <span className="text-green-600 font-medium">✓ 可用</span>
          ) : (
            <span className="text-red-500 font-medium">✗ 不可用</span>
          )}
        </td>
        <td className="px-4 py-2 text-center font-mono">{model.available ? `${model.ttft_ms}ms` : '—'}</td>
        <td className="px-4 py-2 text-slate-500 max-w-xs truncate" title={model.response_preview || ''}>
          {model.response_preview || '—'}
        </td>
        <td className="px-4 py-2 text-red-400 max-w-xs truncate" title={model.error_message || ''}>
          {model.error_message || '—'}
        </td>
        <td className="px-4 py-2 text-center">
          {(model.request_body || model.response_body) && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-blue-600 hover:text-blue-800 text-xs font-medium"
            >
              {expanded ? '收起' : '详情'}
            </button>
          )}
        </td>
      </tr>
      {expanded && (model.request_body || model.response_body) && (
        <tr className="border-t border-slate-100 bg-slate-50">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="font-semibold text-slate-600 mb-1">请求体</div>
                <pre className="bg-white border border-slate-200 rounded p-2 overflow-auto max-h-40 text-slate-700">
                  {model.request_body ? JSON.stringify(JSON.parse(model.request_body), null, 2) : '—'}
                </pre>
              </div>
              <div>
                <div className="font-semibold text-slate-600 mb-1">响应体（前10个chunk）</div>
                <pre className="bg-white border border-slate-200 rounded p-2 overflow-auto max-h-40 text-slate-700">
                  {model.response_body ? JSON.stringify(JSON.parse(model.response_body), null, 2) : '—'}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { listStations, getOverview } = await import('../api');
      const [ov, st] = await Promise.all([getOverview(), listStations()]);
      setOverview(ov);
      setStations(st);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleProbe = async (id: number) => {
    setProbing((p) => new Set(p).add(id));
    try {
      await triggerProbe(id);
      await fetchData();
      // 如果当前展开的是这个站点，刷新详情
      if (expandedId === id) {
        const { getLatestResult } = await import('../api');
        const result = await getLatestResult(id);
        setProbeResult(result);
      }
    } finally {
      setProbing((p) => {
        const next = new Set(p);
        next.delete(id);
        return next;
      });
    }
  };

  const toggleExpand = async (station: Station) => {
    if (expandedId === station.id) {
      setExpandedId(null);
      setProbeResult(null);
    } else {
      setExpandedId(station.id);
      setProbeResult(null);
      const { getLatestResult } = await import('../api');
      const result = await getLatestResult(station.id);
      setProbeResult(result);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">看板</h1>
          <p className="text-sm text-slate-500 mt-1">实时监控中转站状态</p>
        </div>
        <button
          onClick={fetchData}
          className="text-sm text-blue-600 hover:text-blue-800 transition font-medium flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          刷新
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: '总站点', value: overview?.total ?? 0, bg: 'bg-slate-100', textColor: 'text-slate-700' },
          { label: '正常', value: overview?.ok ?? 0, bg: 'bg-green-50', textColor: 'text-green-700' },
          { label: '部分故障', value: overview?.degraded ?? 0, bg: 'bg-yellow-50', textColor: 'text-yellow-700' },
          { label: '宕机', value: overview?.down ?? 0, bg: 'bg-red-50', textColor: 'text-red-700' },
          { label: '未探测', value: overview?.unknown ?? 0, bg: 'bg-slate-100', textColor: 'text-slate-500' },
        ].map((c) => (
          <div key={c.label} className={`${c.bg} rounded-xl p-5 text-center border border-slate-200/50`}>
            <div className={`text-3xl font-bold ${c.textColor}`}>{c.value}</div>
            <div className="text-xs mt-1.5 text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>

      {/* 站点卡片列表 */}
      <div className="space-y-3">
        {stations.length === 0 ? (
          <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
            还没有添加中转站，前往
            <a href="/manage" className="text-blue-600 mx-1 font-medium">管理页面</a>
            添加
          </div>
        ) : (
          stations.map((s) => {
            const config = statusConfig[s.status];
            const isExpanded = expandedId === s.id;
            const isProbing = probing.has(s.id);

            return (
              <div key={s.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {/* 站点头部 - 可点击展开 */}
                <div
                  className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50/50 transition"
                  onClick={() => toggleExpand(s)}
                >
                  {/* 状态指示灯 */}
                  <div className={`w-3 h-3 rounded-full ${config.color} shadow-lg`} title={config.label} />

                  {/* 站点名称 */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{s.name}</div>
                    <div className="text-xs text-slate-400 font-mono truncate mt-0.5">{s.base_url}</div>
                  </div>

                  {/* 密钥脱敏 */}
                  <div className="text-xs text-slate-400 font-mono hidden md:block">{s.api_key_masked}</div>

                  {/* 定时状态 */}
                  <div className="text-xs">
                    {s.schedule_enabled ? (
                      <span className="text-green-600 bg-green-50 px-2 py-1 rounded-full">每{s.schedule_interval_hours}h</span>
                    ) : (
                      <span className="text-slate-400">关闭</span>
                    )}
                  </div>

                  {/* 最近探测时间 */}
                  <div className="text-xs text-slate-400 hidden lg:block">
                    {s.last_probe_at ? new Date(s.last_probe_at).toLocaleString('zh-CN') : '—'}
                  </div>

                  {/* 展开箭头 */}
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* 展开的详情面板 */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-slate-800">探测结果</h3>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleProbe(s.id); }}
                        disabled={isProbing}
                        className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                      >
                        {isProbing ? '探测中...' : '立即探测'}
                      </button>
                    </div>

                    {probeResult?.batch ? (
                      <div className="space-y-4">
                        {/* 概览 */}
                        <div className="grid grid-cols-4 gap-3">
                          {[
                            { label: '总模型', value: probeResult.batch.total_models },
                            { label: '可用', value: probeResult.batch.available_models, color: 'text-green-600' },
                            { label: '不可用', value: probeResult.batch.unavailable_models, color: 'text-red-500' },
                            { label: '耗时', value: `${probeResult.batch.duration_ms}ms` },
                          ].map((c) => (
                            <div key={c.label} className="bg-white rounded-lg p-3 text-center border border-slate-200">
                              <div className={`text-xl font-bold ${c.color || ''}`}>{c.value}</div>
                              <div className="text-xs text-slate-500 mt-1">{c.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* 模型列表 */}
                        {probeResult.models.length > 0 && (
                          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-100 text-slate-600">
                                  <th className="px-4 py-2.5 text-left font-medium">模型</th>
                                  <th className="px-4 py-2.5 text-center font-medium">状态</th>
                                  <th className="px-4 py-2.5 text-center font-medium">TTFT</th>
                                  <th className="px-4 py-2.5 text-left font-medium">响应</th>
                                  <th className="px-4 py-2.5 text-left font-medium">错误</th>
                                  <th className="px-4 py-2.5 text-center font-medium">详情</th>
                                </tr>
                              </thead>
                              <tbody>
                                {probeResult.models.map((m) => (
                                  <ModelRow key={m.id} model={m} />
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        还没有探测记录，点击「立即探测」开始
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}