import { formatJson, type VeridropReport } from '../utils/probeDisplay';

const verdictLabel: Record<string, string> = {
  passed: '通过',
  marginal: '存疑',
  failed: '失败',
};

const statusClass: Record<string, string> = {
  pass: 'bg-[var(--ok-dim)] text-[var(--ok-light)]',
  fail: 'bg-[var(--bad-dim)] text-[var(--bad-light)]',
  error: 'bg-[var(--bad-dim)] text-[var(--bad-light)]',
  skip: 'bg-[var(--surface-2)] text-[var(--ink-faint)]',
};

function metric(value: unknown) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

export function VeridropReportPanel({ report }: { report: VeridropReport }) {
  const important = report.results.filter((item) => item.weight > 0 && item.status !== 'skip');

  return (
    <div className="panel overflow-hidden" style={{ borderRadius: 10 }}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
        <div>
          <div className="text-[12px] font-semibold text-[var(--ink)]">Veridrop 深度检测报告</div>
          <div className="mt-0.5 font-mono text-[10px] text-[var(--ink-faint)]">
            {report.protocol} · {report.mode} · {report.tier}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border px-2 py-1 font-mono text-[11px] font-semibold text-[var(--ink)]" style={{ borderColor: 'var(--line-soft)', background: 'var(--surface-2)' }}>
            {report.total_score.toFixed(1)}
          </span>
          <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${report.verdict === 'passed' ? 'bg-[var(--ok-dim)] text-[var(--ok-light)]' : report.verdict === 'failed' ? 'bg-[var(--bad-dim)] text-[var(--bad-light)]' : 'bg-[var(--warn-dim)] text-[var(--warn-light)]'}`}>
            {verdictLabel[report.verdict] ?? report.verdict}
          </span>
        </div>
      </div>

      <div className="grid gap-3 border-b px-4 py-3 sm:grid-cols-4" style={{ borderColor: 'var(--line)' }}>
        {[
          ['TTFT', report.performance?.ttft_ms === null || report.performance?.ttft_ms === undefined ? '-' : `${report.performance.ttft_ms}ms`],
          ['总耗时', report.performance?.total_latency_ms === undefined ? '-' : `${report.performance.total_latency_ms}ms`],
          ['请求数', metric(report.performance?.request_count)],
          ['Tokens', `${metric(report.performance?.usage?.input_tokens)} / ${metric(report.performance?.usage?.output_tokens)}`],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">{label}</div>
            <div className="mt-1 font-mono text-[12px] font-semibold text-[var(--ink)]">{value}</div>
          </div>
        ))}
      </div>

      {report.summary && (
        <p className="border-b px-4 py-3 text-[12px] text-[var(--ink-dim)]" style={{ borderColor: 'var(--line)' }}>
          {report.summary}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead style={{ background: 'var(--surface-2)' }}>
            <tr>
              <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">检测器</th>
              <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">状态</th>
              <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">分数</th>
              <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">证据</th>
            </tr>
          </thead>
          <tbody>
            {important.map((item) => (
              <tr key={item.name} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="px-4 py-2">
                  <div className="font-mono text-[11px] font-semibold text-[var(--ink)]">{item.name}</div>
                  {item.display_name && <div className="mt-0.5 text-[10px] text-[var(--ink-faint)]">{item.display_name}</div>}
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${statusClass[item.status] ?? 'bg-[var(--surface-2)] text-[var(--ink-dim)]'}`}>
                    {item.status}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-[11px] text-[var(--ink-dim)]">{item.score.toFixed(1)} / w{item.weight}</td>
                <td className="px-4 py-2">
                  <pre className="max-h-24 overflow-auto rounded-md border p-2 text-[10px] leading-5 font-mono" style={{ borderColor: 'var(--line-soft)', background: 'var(--bg)', color: 'var(--ink-dim)' }}>
                    {item.error ? item.error : formatJson(item.details ?? {})}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
