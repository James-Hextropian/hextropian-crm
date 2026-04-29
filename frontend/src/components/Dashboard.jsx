import { useEffect, useState } from 'react';
import { fetchDashboard } from '../api';
import { authFetch } from '../context/AuthContext';
import PipelineChart from './PipelineChart';
import MeddicScoreRing from './meddic/MeddicScoreRing';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const STAGE_COLOR = {
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

const DIM_NAMES = {
  metrics: 'Metrics', economic_buyer: 'Economic Buyer', decision_criteria: 'Decision Criteria',
  decision_process: 'Decision Process', identify_pain: 'Identify Pain', champion: 'Champion',
};

const fmtShort = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n);

export default function Dashboard() {
  const [data,   setData]   = useState(null);
  const [error,  setError]  = useState(null);
  const [meddic, setMeddic] = useState(null);

  useEffect(() => {
    fetchDashboard().then(setData).catch((e) => setError(e.message));
    authFetch('/api/meddic/dashboard').then(setMeddic).catch(() => {});
  }, []);

  if (error) return <p className="error">Failed to load dashboard: {error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const { totals, stages, industries } = data;

  return (
    <div className="dashboard">
      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-label">Total Accounts</span>
          <span className="stat-value">{totals.total_customers}</span>
        </div>
        <div className="stat-card accent-green">
          <span className="stat-label">Won Revenue</span>
          <span className="stat-value">{fmt(totals.active_revenue)}</span>
        </div>
        <div className="stat-card accent-amber">
          <span className="stat-label">Active Pipeline</span>
          <span className="stat-value">{fmt(totals.pipeline_value)}</span>
        </div>
        <div className="stat-card accent-indigo">
          <span className="stat-label">Total Pipeline</span>
          <span className="stat-value">{fmt(totals.total_pipeline)}</span>
        </div>
      </div>

      <PipelineChart stages={stages} />

      <div className="dash-grid">
        <section className="dash-card">
          <h3>By Stage</h3>
          <table className="dash-table">
            <thead><tr><th>Stage</th><th>Count</th><th>Value</th></tr></thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.deal_stage}>
                  <td>
                    <span className="badge" style={{ background: STAGE_COLOR[s.deal_stage] || '#6b7280' }}>
                      {s.deal_stage}
                    </span>
                  </td>
                  <td>{s.count}</td>
                  <td>{fmt(s.total_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="dash-card">
          <h3>By Industry</h3>
          <table className="dash-table">
            <thead><tr><th>Industry</th><th>Count</th><th>Value</th></tr></thead>
            <tbody>
              {industries.map((i) => (
                <tr key={i.industry}>
                  <td>{i.industry || '—'}</td>
                  <td>{i.count}</td>
                  <td>{fmt(i.total_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* ── MEDDIC Widget ── */}
      {meddic && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>MEDDIC Pipeline Health</h2>
          <div className="dash-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>

            {/* Score + dimension completion */}
            <section className="dash-card">
              <h3>Qualification Overview</h3>
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <MeddicScoreRing score={meddic.avgScore} data={{}} size={90} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{meddic.totalDeals} active deals</span>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  {Object.entries(meddic.dimCompletion || {}).map(([dim, pct]) => (
                    <div key={dim} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                        <span style={{ color: 'var(--muted)' }}>{DIM_NAMES[dim]}</span>
                        <span style={{ fontWeight: 600 }}>{pct}%</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 3,
                          width: `${pct}%`,
                          background: pct >= 71 ? '#10b981' : pct >= 41 ? '#f59e0b' : '#ef4444',
                          transition: 'width 0.4s ease',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Bottom deals */}
            <section className="dash-card">
              <h3>Lowest MEDDIC Scores</h3>
              <table className="dash-table">
                <thead><tr><th>Account</th><th>Stage</th><th>Score</th></tr></thead>
                <tbody>
                  {(meddic.bottomDeals || []).slice(0, 6).map((d) => {
                    const scoreColor = d.meddic_score >= 71 ? '#10b981' : d.meddic_score >= 41 ? '#f59e0b' : '#ef4444';
                    return (
                      <tr key={d.id}>
                        <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.company_name}
                        </td>
                        <td><span className="badge" style={{ fontSize: 10, background: '#6366f1' }}>{d.deal_stage}</span></td>
                        <td><span style={{ color: scoreColor, fontWeight: 700 }}>{d.meddic_score}%</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            {/* By rep */}
            {meddic.byRep?.length > 0 && (
              <section className="dash-card">
                <h3>MEDDIC by Rep</h3>
                <table className="dash-table">
                  <thead><tr><th>Rep</th><th>Deals</th><th>Avg Score</th></tr></thead>
                  <tbody>
                    {meddic.byRep.map((r) => {
                      const scoreColor = r.avgScore >= 71 ? '#10b981' : r.avgScore >= 41 ? '#f59e0b' : '#ef4444';
                      return (
                        <tr key={r.name}>
                          <td>{r.name}</td>
                          <td>{r.count}</td>
                          <td><span style={{ color: scoreColor, fontWeight: 700 }}>{r.avgScore}%</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
