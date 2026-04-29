import { useEffect, useState } from 'react';
import { fetchPipelineMetrics, fetchRepMetrics, fetchReps, createRep, deleteRep } from '../api';

const STAGES = ['Prospecting', 'Qualification', 'Discovery', 'Demo', 'Negotiation', 'POC Planned', 'POC Active', 'Closed-Won', 'Closed-Lost', 'Post-Sale'];

const STAGE_COLOR = {
  'Prospecting': '#6366f1', 'Qualification': '#8b5cf6', 'Discovery': '#3b82f6',
  'Demo': '#06b6d4', 'Negotiation': '#f59e0b', 'POC Planned': '#f97316',
  'POC Active': '#ef4444', 'Closed-Won': '#10b981', 'Closed-Lost': '#6b7280', 'Post-Sale': '#14b8a6',
};

const fmt = (n) => n != null
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

function RepDetailModal({ repId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRepMetrics(repId).then(setData).catch((e) => setError(e.message));
  }, [repId]);

  if (error) return (
    <div className="modal-overlay"><div className="modal">
      <p className="error">{error}</p>
      <button className="btn-secondary" onClick={onClose}>Close</button>
    </div></div>
  );
  if (!data) return (
    <div className="modal-overlay"><div className="modal"><p className="muted">Loading…</p></div></div>
  );

  const { rep, accounts, byStage, totals } = data;

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 720 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>{rep.name}</h2>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>

        <div className="stat-cards" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card">
            <span className="stat-label">Accounts</span>
            <span className="stat-value">{totals.account_count}</span>
          </div>
          <div className="stat-card accent-indigo">
            <span className="stat-label">Pipeline</span>
            <span className="stat-value" style={{ fontSize: 18 }}>{fmt(totals.total_pipeline)}</span>
          </div>
          <div className="stat-card accent-green">
            <span className="stat-label">Weighted Value</span>
            <span className="stat-value" style={{ fontSize: 18 }}>{fmt(totals.weighted_value)}</span>
          </div>
          <div className="stat-card accent-amber">
            <span className="stat-label">Avg Probability</span>
            <span className="stat-value">{totals.avg_probability != null ? `${totals.avg_probability}%` : '—'}</span>
          </div>
        </div>

        {byStage.length > 0 && (
          <div className="dash-card" style={{ marginBottom: '1rem' }}>
            <h3>By Stage</h3>
            <table className="dash-table">
              <thead><tr><th>Stage</th><th>Count</th><th>Value</th><th>Weighted</th></tr></thead>
              <tbody>
                {byStage.map((s) => (
                  <tr key={s.deal_stage}>
                    <td><span className="badge" style={{ background: STAGE_COLOR[s.deal_stage] || '#6b7280' }}>{s.deal_stage}</span></td>
                    <td>{s.count}</td>
                    <td>{fmt(s.total_value)}</td>
                    <td>{fmt(s.weighted_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {accounts.length > 0 && (
          <div className="dash-card">
            <h3>Accounts ({accounts.length})</h3>
            <table className="dash-table">
              <thead><tr><th>Company</th><th>Stage</th><th>Value</th><th>Prob</th><th>Close</th><th>Days</th></tr></thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.company_name}</td>
                    <td><span className="badge" style={{ background: STAGE_COLOR[a.deal_stage] || '#6b7280', fontSize: 11 }}>{a.deal_stage}</span></td>
                    <td>{fmt(a.deal_value)}</td>
                    <td>{a.probability != null ? `${a.probability}%` : '—'}</td>
                    <td>{fmtDate(a.expected_close_date)}</td>
                    <td>{a.days_in_stage ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RepMetrics({ onRepsChanged }) {
  const [pipeline, setPipeline] = useState(null);
  const [reps, setReps] = useState([]);
  const [error, setError] = useState(null);
  const [selectedRep, setSelectedRep] = useState(null);
  const [newRepName, setNewRepName] = useState('');
  const [newRepEmail, setNewRepEmail] = useState('');
  const [addingRep, setAddingRep] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const load = async () => {
    try {
      const [p, r] = await Promise.all([fetchPipelineMetrics(), fetchReps()]);
      setPipeline(p);
      setReps(r);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAddRep = async (e) => {
    e.preventDefault();
    if (!newRepName.trim()) return;
    setAddingRep(true);
    try {
      await createRep({ name: newRepName.trim(), email: newRepEmail.trim() || null });
      setNewRepName('');
      setNewRepEmail('');
      setShowAddForm(false);
      await load();
      onRepsChanged?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingRep(false);
    }
  };

  const handleDeleteRep = async (id, name) => {
    if (!confirm(`Remove rep "${name}"? Their accounts will become unassigned.`)) return;
    try {
      await deleteRep(id);
      await load();
      onRepsChanged?.();
    } catch (err) {
      alert(err.message);
    }
  };

  if (error) return <p className="error">{error}</p>;
  if (!pipeline) return <p className="muted">Loading…</p>;

  const { totals, byStage, byRep } = pipeline;

  return (
    <div className="dashboard">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Pipeline Metrics</h2>
      </div>

      {/* Overall stats */}
      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-label">Total Accounts</span>
          <span className="stat-value">{totals.total_accounts}</span>
        </div>
        <div className="stat-card accent-indigo">
          <span className="stat-label">Active Pipeline</span>
          <span className="stat-value" style={{ fontSize: 20 }}>{fmt(totals.active_pipeline)}</span>
        </div>
        <div className="stat-card accent-green">
          <span className="stat-label">Won Revenue</span>
          <span className="stat-value" style={{ fontSize: 20 }}>{fmt(totals.won_revenue)}</span>
        </div>
        <div className="stat-card accent-amber">
          <span className="stat-label">Weighted Pipeline</span>
          <span className="stat-value" style={{ fontSize: 20 }}>{fmt(totals.weighted_pipeline)}</span>
        </div>
        {totals.earliest_close && (
          <div className="stat-card">
            <span className="stat-label">Next Close</span>
            <span className="stat-value" style={{ fontSize: 16 }}>{fmtDate(totals.earliest_close)}</span>
          </div>
        )}
      </div>

      <div className="dash-grid">
        {/* By Stage */}
        <section className="dash-card">
          <h3>By Stage</h3>
          <table className="dash-table">
            <thead><tr><th>Stage</th><th>Count</th><th>Value</th><th>Weighted</th><th>Avg %</th></tr></thead>
            <tbody>
              {byStage.map((s) => (
                <tr key={s.deal_stage}>
                  <td><span className="badge" style={{ background: STAGE_COLOR[s.deal_stage] || '#6b7280' }}>{s.deal_stage}</span></td>
                  <td>{s.count}</td>
                  <td>{fmt(s.total_value)}</td>
                  <td>{fmt(s.weighted_value)}</td>
                  <td>{s.avg_probability != null ? `${s.avg_probability}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* By Rep */}
        <section className="dash-card">
          <h3>By Sales Rep</h3>
          {byRep.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>No reps assigned yet.</p>
          ) : (
            <table className="dash-table">
              <thead><tr><th>Rep</th><th>Accounts</th><th>Pipeline</th><th>Weighted</th><th></th></tr></thead>
              <tbody>
                {byRep.map((r) => (
                  <tr key={r.rep_id}>
                    <td style={{ fontWeight: 600 }}>{r.rep_name}</td>
                    <td>{r.account_count}</td>
                    <td>{fmt(r.total_value)}</td>
                    <td>{fmt(r.weighted_value)}</td>
                    <td>
                      <button className="btn-icon" style={{ opacity: 1, fontSize: 12 }} onClick={() => setSelectedRep(r.rep_id)} title="View detail">👁️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Manage Reps */}
      <section className="dash-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Sales Reps</h3>
          <button className="btn-primary" onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? 'Cancel' : '+ Add Rep'}
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleAddRep} style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
            <input
              placeholder="Name *"
              value={newRepName}
              onChange={(e) => setNewRepName(e.target.value)}
              required
              style={{ flex: 1, minWidth: 140 }}
            />
            <input
              placeholder="Email (optional)"
              type="email"
              value={newRepEmail}
              onChange={(e) => setNewRepEmail(e.target.value)}
              style={{ flex: 1, minWidth: 180 }}
            />
            <button type="submit" className="btn-primary" disabled={addingRep}>
              {addingRep ? 'Adding…' : 'Add'}
            </button>
          </form>
        )}

        {reps.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No reps yet. Add one above.</p>
        ) : (
          <table className="dash-table">
            <thead><tr><th>Name</th><th>Email</th><th></th></tr></thead>
            <tbody>
              {reps.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td className="muted">{r.email || '—'}</td>
                  <td>
                    <button className="btn-icon" onClick={() => handleDeleteRep(r.id, r.name)} title="Remove">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {selectedRep && <RepDetailModal repId={selectedRep} onClose={() => setSelectedRep(null)} />}
    </div>
  );
}
