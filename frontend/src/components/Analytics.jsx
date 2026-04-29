import { useEffect, useState } from 'react';
import { fetchStageTimes } from '../api';

const STAGE_COLOR = {
  'Prospecting': '#6366f1', 'Qualification': '#8b5cf6', 'Discovery': '#3b82f6',
  'Demo': '#06b6d4', 'Negotiation': '#f59e0b', 'POC Planned': '#f97316',
  'POC Active': '#ef4444', 'Closed-Won': '#10b981', 'Closed-Lost': '#6b7280', 'Post-Sale': '#14b8a6',
};

function DaysBar({ days, maxDays }) {
  const pct = maxDays > 0 ? Math.max(2, (days / maxDays) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 13, minWidth: 36, textAlign: 'right' }}>{days ?? '—'}</span>
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState('all'); // 'all' | 'won'

  useEffect(() => {
    fetchStageTimes().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data)  return <p className="muted">Loading analytics…</p>;

  const { allStages, wonStages, closeTimes } = data;
  const stages = view === 'won' ? wonStages : allStages;
  const maxAvg = Math.max(...stages.map((s) => s.avg_days ?? 0), 1);

  const longestStage = stages.reduce((a, b) => (a.avg_days ?? 0) > (b.avg_days ?? 0) ? a : b, {});
  const fastestStage = stages.filter((s) => s.avg_days != null).reduce((a, b) => (a.avg_days ?? Infinity) < (b.avg_days ?? Infinity) ? a : b, {});

  return (
    <div className="dashboard">
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Sales Cycle Analytics</h2>

      {/* Time to Close */}
      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-label">Won Deals</span>
          <span className="stat-value">{closeTimes.won_deals}</span>
        </div>
        <div className="stat-card accent-green">
          <span className="stat-label">Avg Days to Close</span>
          <span className="stat-value">{closeTimes.avg_days_to_close ?? '—'}</span>
        </div>
        <div className="stat-card accent-indigo">
          <span className="stat-label">Median Days to Close</span>
          <span className="stat-value">{closeTimes.median_days_to_close ?? '—'}</span>
        </div>
        {longestStage.stage && (
          <div className="stat-card accent-amber">
            <span className="stat-label">Longest Stage</span>
            <span className="stat-value" style={{ fontSize: 16 }}>{longestStage.stage}</span>
          </div>
        )}
        {fastestStage.stage && (
          <div className="stat-card">
            <span className="stat-label">Fastest Stage</span>
            <span className="stat-value" style={{ fontSize: 16 }}>{fastestStage.stage}</span>
          </div>
        )}
      </div>

      {/* Stage timing table */}
      <section className="dash-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Time in Each Stage</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={view === 'all' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setView('all')}>
              All Deals
            </button>
            <button className={view === 'won' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setView('won')}>
              Won Deals Only
            </button>
          </div>
        </div>

        {stages.length === 0 ? (
          <p className="muted">No stage history data yet. Stage transitions will be tracked automatically.</p>
        ) : (
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Avg Days</th>
                <th>Median Days</th>
                <th>Sample Size</th>
                <th style={{ width: '30%' }}>Distribution</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.stage}>
                  <td>
                    <span className="badge" style={{ background: STAGE_COLOR[s.stage] || '#6b7280' }}>
                      {s.stage}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{s.avg_days ?? '—'}</td>
                  <td>{s.median_days ?? '—'}</td>
                  <td className="muted">{s.sample_count}</td>
                  <td><DaysBar days={s.avg_days} maxDays={maxAvg} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="dash-card">
        <h3>How Stage Timing Works</h3>
        <ul style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 2, paddingLeft: '1.5rem' }}>
          <li>Stage entry/exit timestamps are recorded automatically every time a deal moves to a new stage.</li>
          <li><strong>All Deals</strong> includes active deals (exit date = now for still-active stages).</li>
          <li><strong>Won Deals Only</strong> shows time per stage for deals that reached Closed-Won.</li>
          <li>Median is more reliable than average when outliers exist (e.g., stale deals).</li>
        </ul>
      </section>
    </div>
  );
}
