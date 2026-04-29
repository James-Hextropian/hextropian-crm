import { useEffect, useState } from 'react';
import { fetchProspectingMetrics, fetchLeadDistribution } from '../api';
import { OUTREACH_STAGES } from './WorkQueue';

const STAGE_KEY_LABEL = Object.fromEntries([
  ...OUTREACH_STAGES.map((s) => [s.key, `${s.icon} ${s.label}`]),
  ['converted',   '⚡ Converted'],
  ['no_interest', '✕ No Interest'],
]);

export default function ProspectingMetrics() {
  const [data, setData]         = useState(null);
  const [distrib, setDistrib]   = useState([]);
  const [error, setError]       = useState(null);

  useEffect(() => {
    fetchProspectingMetrics().then(setData).catch((e) => setError(e.message));
    fetchLeadDistribution().then(setDistrib).catch(() => {});
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data)  return <p className="muted">Loading metrics…</p>;

  const { totals, funnel, byVertical, byRep, timing } = data;

  const conversionRate = totals.total_contacts > 0
    ? ((totals.converted_contacts / totals.total_contacts) * 100).toFixed(1)
    : '0.0';

  // Funnel max for bar scaling
  const funnelMax = Math.max(...funnel.map((f) => f.count), 1);

  return (
    <div className="dashboard">
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Prospecting Metrics</h2>

      {/* Summary stats */}
      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-label">Total Contacts</span>
          <span className="stat-value">{totals.total_contacts.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Available (New)</span>
          <span className="stat-value">{totals.new_contacts.toLocaleString()}</span>
        </div>
        <div className="stat-card accent-amber">
          <span className="stat-label">In Active Queue</span>
          <span className="stat-value">{totals.active_in_queue}</span>
        </div>
        <div className="stat-card accent-green">
          <span className="stat-label">Converted</span>
          <span className="stat-value">{totals.converted_contacts}</span>
        </div>
        <div className="stat-card accent-indigo">
          <span className="stat-label">Conversion Rate</span>
          <span className="stat-value">{conversionRate}%</span>
        </div>
        {timing.avg_days_to_convert != null && (
          <div className="stat-card">
            <span className="stat-label">Avg Days to Convert</span>
            <span className="stat-value">{timing.avg_days_to_convert}</span>
          </div>
        )}
      </div>

      <div className="dash-grid">
        {/* Outreach funnel */}
        <section className="dash-card">
          <h3>Outreach Funnel</h3>
          {funnel.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>No outreach activity yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {funnel.map((f) => {
                const pct = Math.max(4, (f.count / funnelMax) * 100);
                return (
                  <div key={f.stage} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, minWidth: 140, color: 'var(--muted)' }}>
                      {STAGE_KEY_LABEL[f.stage] || f.stage}
                    </span>
                    <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 4, height: 14, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, transition: 'width 0.4s' }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, minWidth: 30, textAlign: 'right' }}>{f.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Rep productivity */}
        <section className="dash-card">
          <h3>Rep Productivity</h3>
          {byRep.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>No reps assigned yet.</p>
          ) : (
            <table className="dash-table">
              <thead><tr><th>Rep</th><th>Queued</th><th>Active</th><th>Converted</th><th>No Int.</th></tr></thead>
              <tbody>
                {byRep.map((r) => (
                  <tr key={r.rep_id}>
                    <td style={{ fontWeight: 600 }}>{r.rep_name}</td>
                    <td>{r.queued}</td>
                    <td>{r.active}</td>
                    <td style={{ color: 'var(--green)', fontWeight: 600 }}>{r.converted}</td>
                    <td className="muted">{r.no_interest}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Lead Distribution */}
      {distrib.length > 0 && (
        <section className="dash-card">
          <h3>Lead Distribution by Rep</h3>
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Rep</th>
                <th>Total</th>
                <th>Unworked</th>
                <th>Active</th>
                <th>Converted</th>
                <th>No Int.</th>
                <th>Top Verticals</th>
              </tr>
            </thead>
            <tbody>
              {distrib.map((r) => (
                <tr key={r.owner_rep_id ?? 'unassigned'}>
                  <td style={{ fontWeight: 600 }}>
                    {r.rep_name === 'Unassigned'
                      ? <span className="muted">{r.rep_name}</span>
                      : r.rep_name}
                  </td>
                  <td>{r.total.toLocaleString()}</td>
                  <td style={{ color: 'var(--indigo)', fontWeight: 600 }}>{r.new_count.toLocaleString()}</td>
                  <td style={{ color: 'var(--amber)' }}>{r.active_count}</td>
                  <td style={{ color: 'var(--green)', fontWeight: 600 }}>{r.converted_count}</td>
                  <td className="muted">{r.no_interest_count}</td>
                  <td>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {r.top_verticals.length > 0
                        ? r.top_verticals.map((v) => `${v.vertical} (${v.count})`).join(', ')
                        : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* By vertical */}
      <section className="dash-card">
        <h3>By Vertical</h3>
        {byVertical.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No contacts imported yet.</p>
        ) : (
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Vertical</th>
                <th>Total</th>
                <th>Available</th>
                <th>Converted</th>
                <th>No Interest</th>
                <th>Conv. Rate</th>
              </tr>
            </thead>
            <tbody>
              {byVertical.map((v) => {
                const rate = v.total > 0 ? ((v.converted / v.total) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={v.vertical}>
                    <td style={{ fontWeight: 600 }}>{v.vertical}</td>
                    <td>{v.total.toLocaleString()}</td>
                    <td>{v.available.toLocaleString()}</td>
                    <td style={{ color: 'var(--green)', fontWeight: 600 }}>{v.converted}</td>
                    <td className="muted">{v.no_interest}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: Number(rate) > 5 ? 'var(--green)' : 'var(--text)' }}>
                        {rate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
