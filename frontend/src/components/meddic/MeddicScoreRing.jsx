const DIMS = ['metrics', 'economic_buyer', 'decision_criteria', 'decision_process', 'identify_pain', 'champion'];
const DIM_LABEL = {
  metrics: 'M', economic_buyer: 'E', decision_criteria: 'D',
  decision_process: 'D', identify_pain: 'I', champion: 'C',
};

function scoreColor(score) {
  if (score >= 71) return '#10b981';
  if (score >= 41) return '#f59e0b';
  return '#ef4444';
}

function dimScore(data, dim) {
  const d = data?.[dim] || {};
  switch (dim) {
    case 'metrics':
      return !d.business_impact ? 0 : (d.roi_estimate && d.success_metrics ? 2 : 1);
    case 'economic_buyer':
      return !d.name ? 0 : (d.contacted && d.accessible ? 2 : 1);
    case 'decision_criteria':
      return (!d.technical_criteria && !d.business_criteria) ? 0 : (d.technical_criteria && d.business_criteria ? 2 : 1);
    case 'decision_process':
      return !d.process_steps ? 0 : (d.timeline && d.next_formal_step ? 2 : 1);
    case 'identify_pain':
      return !d.primary_pain ? 0 : (d.pain_impact && d.urgency_reason ? 2 : 1);
    case 'champion':
      return !d.name ? 0 : (d.engaged && d.access_power ? 2 : 1);
    default: return 0;
  }
}

export default function MeddicScoreRing({ score = 0, data = {}, size = 120 }) {
  const cx = size / 2;
  const cy = size / 2;
  const r  = size * 0.38;
  const circumference = 2 * Math.PI * r;
  const filled = circumference * (score / 100);
  const gap    = circumference - filled;
  const color  = scoreColor(score);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={size} height={size} style={{ overflow: 'visible' }}>
        {/* track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={size * 0.09} />
        {/* fill */}
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={size * 0.09}
          strokeDasharray={`${filled} ${gap}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
        {/* score text */}
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          style={{ fill: color, fontSize: size * 0.22, fontWeight: 700, fontFamily: 'inherit' }}>
          {score}%
        </text>
        {/* dim dots */}
        {DIMS.map((dim, i) => {
          const angle = (i / DIMS.length) * 2 * Math.PI - Math.PI / 2;
          const dr = size * 0.5;
          const dx = cx + Math.cos(angle) * dr;
          const dy = cy + Math.sin(angle) * dr;
          const ds = dimScore(data, dim);
          const dotColor = ds === 2 ? '#10b981' : ds === 1 ? '#f59e0b' : 'var(--border)';
          return (
            <g key={dim}>
              <circle cx={dx} cy={dy} r={size * 0.068} fill={dotColor} />
              <text x={dx} y={dy + 1} textAnchor="middle" dominantBaseline="middle"
                style={{ fill: '#fff', fontSize: size * 0.07, fontWeight: 700, fontFamily: 'inherit' }}>
                {DIM_LABEL[dim]}
              </text>
            </g>
          );
        })}
      </svg>
      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>MEDDIC Score</span>
    </div>
  );
}
