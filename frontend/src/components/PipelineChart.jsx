const STAGES = [
  'Prospecting', 'Qualification', 'Discovery', 'Demo', 'Negotiation',
  'POC Planned', 'POC Active', 'Closed-Won', 'Closed-Lost', 'Post-Sale',
];

const ACTIVE_STAGES = new Set([
  'Prospecting', 'Qualification', 'Discovery', 'Demo', 'Negotiation', 'POC Planned', 'POC Active',
]);

const COLOR = {
  'Prospecting':   '#6366f1',
  'Qualification': '#8b5cf6',
  'Discovery':     '#3b82f6',
  'Demo':          '#06b6d4',
  'Negotiation':   '#f59e0b',
  'POC Planned':   '#f97316',
  'POC Active':    '#ef4444',
  'Closed-Won':    '#10b981',
  'Closed-Lost':   '#6b7280',
  'Post-Sale':     '#14b8a6',
};

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const fmtShort = (n) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return fmt(n);
};

export default function PipelineChart({ stages }) {
  const byStage = Object.fromEntries(stages.map((s) => [s.deal_stage, s]));
  const ordered = STAGES.map((name) => ({
    name,
    count: byStage[name]?.count ?? 0,
    value: Number(byStage[name]?.total_value ?? 0),
  }));

  const activeOrdered = ordered.filter((s) => ACTIVE_STAGES.has(s.name));
  const totalActiveValue = activeOrdered.reduce((sum, s) => sum + s.value, 0);
  const maxValue = Math.max(...ordered.map((s) => s.value), 1);

  const W = 600;
  const BAR_H = 26;
  const ROW_H = 40;
  const LABEL_W = 120;
  const VAL_W = 72;
  const BAR_W = W - LABEL_W - VAL_W - 16;
  const H = STAGES.length * ROW_H;

  return (
    <section className="dash-card pipeline-card">
      <h3>Pipeline by Stage</h3>

      {/* Stacked bar — active pipeline only */}
      <div className="pipeline-stack-wrap">
        <div className="pipeline-stack">
          {activeOrdered.map((s) => {
            const pct = totalActiveValue > 0 ? (s.value / totalActiveValue) * 100 : 0;
            return pct > 0 ? (
              <div
                key={s.name}
                className="pipeline-stack-segment"
                style={{ width: `${pct}%`, background: COLOR[s.name] }}
                title={`${s.name}: ${fmt(s.value)} (${pct.toFixed(1)}%)`}
              />
            ) : null;
          })}
        </div>
        <div className="pipeline-stack-legend">
          {ordered.filter((s) => s.count > 0).map((s) => (
            <span key={s.name} className="legend-item">
              <span className="legend-dot" style={{ background: COLOR[s.name] }} />
              {s.name} ({s.count})
            </span>
          ))}
        </div>
      </div>

      {/* Horizontal bar chart per stage */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', marginTop: '1.5rem', overflow: 'visible' }}
        aria-label="Pipeline value by stage"
      >
        {ordered.map((s, i) => {
          const barWidth = maxValue > 0 ? (s.value / maxValue) * BAR_W : 0;
          const y = i * ROW_H + (ROW_H - BAR_H) / 2;
          const labelY = i * ROW_H + ROW_H / 2;

          return (
            <g key={s.name}>
              <text
                x={LABEL_W - 8}
                y={labelY}
                textAnchor="end"
                dominantBaseline="middle"
                fill={s.count > 0 ? '#e8eaf0' : '#7b82a0'}
                fontSize="11"
                fontWeight={s.count > 0 ? '600' : '400'}
              >
                {s.name}
              </text>
              <rect x={LABEL_W} y={y} width={BAR_W} height={BAR_H} rx={5} fill="#22263a" />
              {barWidth > 0 && (
                <rect x={LABEL_W} y={y} width={barWidth} height={BAR_H} rx={5} fill={COLOR[s.name]} opacity={0.9} />
              )}
              {s.count > 0 && barWidth > 40 && (
                <text x={LABEL_W + 10} y={labelY} dominantBaseline="middle" fill="#fff" fontSize="10" fontWeight="600" opacity={0.9}>
                  {s.count} {s.count === 1 ? 'deal' : 'deals'}
                </text>
              )}
              <text
                x={LABEL_W + BAR_W + 8}
                y={labelY}
                dominantBaseline="middle"
                fill={s.value > 0 ? '#e8eaf0' : '#7b82a0'}
                fontSize="11"
                fontWeight="600"
              >
                {s.value > 0 ? fmtShort(s.value) : s.count > 0 ? `${s.count}` : '—'}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
