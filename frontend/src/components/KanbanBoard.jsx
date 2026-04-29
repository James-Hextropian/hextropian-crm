import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchCustomers, updateCustomer } from '../api';

const STAGES = ['Prospecting', 'Qualification', 'Discovery', 'Demo', 'Negotiation', 'POC Planned', 'POC Active', 'Closed-Won', 'Closed-Lost', 'Post-Sale'];

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

const PROB_COLOR = (p) => {
  if (!p) return '#6b7280';
  if (p <= 10) return '#ef4444';
  if (p <= 25) return '#f97316';
  if (p <= 50) return '#f59e0b';
  if (p <= 75) return '#84cc16';
  return '#10b981';
};

const fmt = (n) => n != null
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : null;
const fmtDateShort = (d) => d
  ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;

function KanbanCard({ account, onDragStart, onViewDetail }) {
  return (
    <div
      className="kanban-card"
      draggable
      onDragStart={() => onDragStart(account)}
      style={{ borderLeftColor: STAGE_COLOR[account.deal_stage] }}
    >
      <button className="kanban-card-name" onClick={() => onViewDetail(account.id)}>
        {account.company_name}
      </button>

      <div className="kanban-card-meta">
        {fmt(account.deal_value) && (
          <span className="kanban-card-value">{fmt(account.deal_value)}</span>
        )}
        {account.probability != null && (
          <span className="badge kanban-prob-badge" style={{ background: PROB_COLOR(account.probability) }}>
            {account.probability}%
          </span>
        )}
      </div>

      <div className="kanban-card-footer">
        {fmtDateShort(account.expected_close_date) && (
          <span className="kanban-card-close">📅 {fmtDateShort(account.expected_close_date)}</span>
        )}
        {account.days_in_stage > 0 && (
          <span className="kanban-card-days">{account.days_in_stage}d</span>
        )}
      </div>

      {account.owner_name && (
        <div className="kanban-card-owner">{account.owner_name}</div>
      )}
    </div>
  );
}

export default function KanbanBoard({ onViewDetail, currentRepId }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [myOnly, setMyOnly]     = useState(false);
  const [dragOver, setDragOver] = useState(null);
  const dragging = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = myOnly && currentRepId ? { owner: currentRepId } : {};
      const data = await fetchCustomers({ ...params, sort: 'company_name', order: 'asc' });
      setAccounts(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [myOnly, currentRepId]);

  useEffect(() => { load(); }, [load]);

  const byStage = STAGES.reduce((acc, s) => {
    acc[s] = accounts.filter((a) => a.deal_stage === s);
    return acc;
  }, {});

  const handleDragStart = (account) => { dragging.current = account; };

  const handleDrop = async (newStage) => {
    const account = dragging.current;
    dragging.current = null;
    setDragOver(null);
    if (!account || account.deal_stage === newStage) return;

    // Optimistic update
    setAccounts((prev) => prev.map((a) => a.id === account.id ? { ...a, deal_stage: newStage } : a));

    try {
      await updateCustomer(account.id, { ...account, deal_stage: newStage });
    } catch (e) {
      alert(`Failed to move account: ${e.message}`);
      setAccounts((prev) => prev.map((a) => a.id === account.id ? { ...a, deal_stage: account.deal_stage } : a));
    }
  };

  const stageValue = (stage) => byStage[stage].reduce((sum, a) => sum + (Number(a.deal_value) || 0), 0);
  const fmtK = (n) => n >= 1000 ? `$${Math.round(n / 1000)}k` : n > 0 ? `$${n}` : null;

  if (loading) return <p className="muted">Loading pipeline…</p>;
  if (error)   return <p className="error">{error}</p>;

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Pipeline Board</h2>
        {currentRepId && (
          <button className={myOnly ? 'btn-primary' : 'btn-secondary'} onClick={() => setMyOnly((v) => !v)}>
            My Accounts
          </button>
        )}
        <span className="muted" style={{ fontSize: 13, marginLeft: 'auto' }}>
          Drag cards to move between stages
        </span>
      </div>

      <div className="kanban-board">
        {STAGES.map((stage) => {
          const cards = byStage[stage];
          const val = stageValue(stage);
          return (
            <div
              key={stage}
              className={`kanban-column${dragOver === stage ? ' kanban-column-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(stage); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => handleDrop(stage)}
            >
              <div className="kanban-col-header">
                <span className="badge" style={{ background: STAGE_COLOR[stage], fontSize: 11 }}>{stage}</span>
                <span className="kanban-col-count">{cards.length}</span>
              </div>
              {fmtK(val) && (
                <div className="kanban-col-value">{fmtK(val)}</div>
              )}
              <div className="kanban-cards">
                {cards.length === 0
                  ? <div className="kanban-empty">Drop here</div>
                  : cards.map((a) => (
                    <KanbanCard key={a.id} account={a} onDragStart={handleDragStart} onViewDetail={onViewDetail} />
                  ))
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
