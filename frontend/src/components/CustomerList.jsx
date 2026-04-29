import { useEffect, useState, useCallback } from 'react';
import { fetchCustomers, fetchReps, deleteCustomer, exportUrl } from '../api';
import CustomerForm from './CustomerForm';
import EmailModal from './EmailModal';

const INDUSTRIES = ['Oil & Gas', 'Financial Services', 'Life Sciences', 'Technology', 'Retail', 'Healthcare', 'Manufacturing', 'Other'];
const ALL_STAGES = ['Prospecting', 'Qualification', 'Discovery', 'Demo', 'Negotiation', 'POC Planned', 'POC Active', 'Closed-Won', 'Closed-Lost', 'Post-Sale'];

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

const fmt = (n) => n != null ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function CustomerList({ onViewDetail, currentRepId }) {
  const [customers, setCustomers] = useState([]);
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [dealStage, setDealStage] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [myAccounts, setMyAccounts] = useState(false);
  const [sort, setSort] = useState('company_name');
  const [order, setOrder] = useState('asc');
  const [editing, setEditing] = useState(null);
  const [emailing, setEmailing] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => { fetchReps().then(setReps).catch(() => {}); }, []);

  const effectiveOwner = myAccounts && currentRepId ? currentRepId : (ownerFilter || undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCustomers({
        search, industry, deal_stage: dealStage,
        owner: effectiveOwner,
        sort, order,
      });
      setCustomers(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, industry, dealStage, effectiveOwner, sort, order]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (col) => {
    if (sort === col) setOrder((o) => o === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setOrder('asc'); }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete ${name}?`)) return;
    await deleteCustomer(id);
    setCustomers((cs) => cs.filter((c) => c.id !== id));
  };

  const handleSaved = (saved) => {
    setCustomers((cs) => {
      const idx = cs.findIndex((c) => c.id === saved.id);
      return idx >= 0 ? cs.map((c) => c.id === saved.id ? saved : c) : [saved, ...cs];
    });
    setEditing(null);
  };

  const sortIcon = (col) => sort === col ? (order === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div>
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search company, contact, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
          <option value="">All Industries</option>
          {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
        </select>
        <select value={dealStage} onChange={(e) => setDealStage(e.target.value)}>
          <option value="">All Stages</option>
          {ALL_STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={ownerFilter} onChange={(e) => { setOwnerFilter(e.target.value); setMyAccounts(false); }} disabled={myAccounts}>
          <option value="">All Owners</option>
          {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {currentRepId && (
          <button
            className={myAccounts ? 'btn-primary' : 'btn-secondary'}
            onClick={() => { setMyAccounts((v) => !v); setOwnerFilter(''); }}
          >
            My Accounts
          </button>
        )}
        <a className="btn-secondary" href={exportUrl({ industry, deal_stage: dealStage, owner: effectiveOwner })} download>
          Export CSV
        </a>
        <button className="btn-primary" onClick={() => setEditing(false)}>+ Add Account</button>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : customers.length === 0 ? (
        <p className="muted">No accounts found.</p>
      ) : (
        <div className="table-wrap">
          <table className="customer-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('company_name')} className="sortable">Company{sortIcon('company_name')}</th>
                <th>Contact</th>
                <th onClick={() => handleSort('industry')} className="sortable">Industry{sortIcon('industry')}</th>
                <th onClick={() => handleSort('deal_stage')} className="sortable">Stage{sortIcon('deal_stage')}</th>
                <th onClick={() => handleSort('deal_value')} className="sortable">Value{sortIcon('deal_value')}</th>
                <th onClick={() => handleSort('probability')} className="sortable">Prob{sortIcon('probability')}</th>
                <th onClick={() => handleSort('expected_close_date')} className="sortable">Close{sortIcon('expected_close_date')}</th>
                <th>Owner</th>
                <th onClick={() => handleSort('last_contact_date')} className="sortable">Last Contact{sortIcon('last_contact_date')}</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <>
                  <tr key={c.id} className="customer-row" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                    <td className="company-name" onClick={(e) => e.stopPropagation()}>
                      <button className="company-link" onClick={() => onViewDetail(c.id)}>{c.company_name}</button>
                    </td>
                    <td>
                      <div>{c.contact_person || '—'}</div>
                      {c.email && <div className="muted small">{c.email}</div>}
                    </td>
                    <td>{c.industry || '—'}</td>
                    <td>
                      <span className="badge" style={{ background: STAGE_COLOR[c.deal_stage] || '#6b7280' }}>
                        {c.deal_stage}
                      </span>
                    </td>
                    <td>{fmt(c.deal_value)}</td>
                    <td>
                      {c.probability != null
                        ? <span className="badge" style={{ background: PROB_COLOR(c.probability) }}>{c.probability}%</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td>{fmtDate(c.expected_close_date)}</td>
                    <td>
                      {c.owner_name
                        ? <span className="owner-chip">{c.owner_name}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td>{fmtDate(c.last_contact_date)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn-icon" onClick={() => setEmailing(c)} title="Send email" disabled={!c.email} style={!c.email ? { opacity: 0.25, cursor: 'not-allowed' } : {}}>✉️</button>
                      <button className="btn-icon" onClick={() => onViewDetail(c.id)} title="Open account">👁️</button>
                      <button className="btn-icon" onClick={() => setEditing(c)} title="Edit">✏️</button>
                      <button className="btn-icon" onClick={() => handleDelete(c.id, c.company_name)} title="Delete">🗑️</button>
                    </td>
                  </tr>
                  {expanded === c.id && (
                    <tr key={`${c.id}-notes`} className="notes-row">
                      <td colSpan={10}>
                        <div className="notes-content">
                          <strong>Notes:</strong> {c.notes || <em>No notes</em>}
                          {c.phone && <span className="note-phone"> · 📞 {c.phone}</span>}
                          {c.days_in_stage > 0 && <span className="note-phone muted"> · {c.days_in_stage}d in stage</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== null && (
        <CustomerForm customer={editing || null} onSaved={handleSaved} onCancel={() => setEditing(null)} />
      )}
      {emailing && (
        <EmailModal customer={emailing} onClose={() => setEmailing(null)} onSent={() => { setEmailing(null); load(); }} />
      )}
    </div>
  );
}
