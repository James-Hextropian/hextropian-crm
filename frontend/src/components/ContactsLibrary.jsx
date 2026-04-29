import { useEffect, useState, useCallback } from 'react';
import { fetchProspectContacts, fetchContactVerticals, deleteProspectContact, assignToQueue, createContact, bulkAssignContacts, fetchReps } from '../api';

const STATUSES  = ['new', 'active', 'no_interest', 'converted'];
const STATUS_COLOR = {
  new:         '#6366f1',
  active:      '#f59e0b',
  no_interest: '#6b7280',
  converted:   '#10b981',
};
const STATUS_LABEL = { new: 'New', active: 'Active', no_interest: 'No Interest', converted: 'Converted' };

export default function ContactsLibrary({ currentRepId, onOpenProspect }) {
  const [data, setData]         = useState({ contacts: [], total: 0, pages: 1 });
  const [verticals, setVerticals] = useState([]);
  const [reps, setReps]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  // Filters
  const [search, setSearch]       = useState('');
  const [vertical, setVertical]   = useState('');
  const [status, setStatus]       = useState('');
  const [ownerFilter, setOwnerFilter] = useState(''); // '' | 'unassigned' | rep_id string
  const [page, setPage]           = useState(1);

  // Add contact form
  const [showAddForm, setShowAddForm]     = useState(false);
  const [newContact, setNewContact]       = useState({ first_name: '', last_name: '', email: '', linkedin_url: '', company: '', title: '', vertical: '', phone: '' });
  const [addingContact, setAddingContact] = useState(false);

  // Bulk selection + assignment
  const [selected, setSelected]   = useState(new Set());
  const [assignRepId, setAssignRepId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchProspectContacts({ search, vertical, status, owner_rep_id: ownerFilter || undefined, page, limit: 50 });
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, vertical, status, ownerFilter, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelected(new Set()); }, [search, vertical, status, ownerFilter, page]);
  useEffect(() => {
    fetchContactVerticals().then(setVerticals).catch(() => {});
    fetchReps().then(setReps).catch(() => {});
  }, []);

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete contact ${name}? This cannot be undone.`)) return;
    try { await deleteProspectContact(id); load(); } catch (e) { alert(e.message); }
  };

  const handleAssignToQueue = async (contact) => {
    if (!currentRepId) return alert('Select a sales rep first.');
    try {
      await assignToQueue(contact.id, currentRepId);
      alert(`${contact.first_name} ${contact.last_name} added to your workqueue.`);
      load();
    } catch (e) { alert(e.message); }
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    setAddingContact(true);
    try {
      await createContact(newContact);
      setNewContact({ first_name: '', last_name: '', email: '', linkedin_url: '', company: '', title: '', vertical: '', phone: '' });
      setShowAddForm(false);
      load();
    } catch (e) { alert(e.message); } finally { setAddingContact(false); }
  };

  const handleBulkAssign = async () => {
    if (selected.size === 0 || assigning) return;
    setAssigning(true);
    try {
      await bulkAssignContacts([...selected], assignRepId || null);
      setSelected(new Set());
      setAssignRepId('');
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setAssigning(false);
    }
  };

  const toggleAll = () => {
    const allIds = data.contacts.map((c) => c.id);
    const allSelected = allIds.every((id) => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(allIds));
  };

  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const set = (f) => (e) => setNewContact((v) => ({ ...v, [f]: e.target.value }));

  const allPageSelected = data.contacts.length > 0 && data.contacts.every((c) => selected.has(c.id));
  const someSelected    = selected.size > 0;
  const assignTarget    = reps.find((r) => String(r.id) === assignRepId);

  return (
    <div>
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search name, email, company, title…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select value={vertical} onChange={(e) => { setVertical(e.target.value); setPage(1); }}>
          <option value="">All Verticals</option>
          {verticals.map((v) => (
            <option key={v.vertical} value={v.vertical}>{v.vertical} ({v.total})</option>
          ))}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select value={ownerFilter} onChange={(e) => { setOwnerFilter(e.target.value); setPage(1); }}>
          <option value="">All Owners</option>
          <option value="unassigned">Unassigned</option>
          {reps.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
          {data.total.toLocaleString()} contacts
        </span>
        <button className="btn-primary" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? 'Cancel' : '+ Add Contact'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddContact} className="pe-add-form">
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
            <label>First Name<input value={newContact.first_name} onChange={set('first_name')} /></label>
            <label>Last Name<input value={newContact.last_name} onChange={set('last_name')} /></label>
            <label>Email<input type="email" value={newContact.email} onChange={set('email')} /></label>
            <label>Company<input value={newContact.company} onChange={set('company')} /></label>
            <label>Title<input value={newContact.title} onChange={set('title')} /></label>
            <label>
              Vertical
              <select value={newContact.vertical} onChange={set('vertical')}>
                <option value="">— Select —</option>
                {verticals.map((v) => <option key={v.vertical}>{v.vertical}</option>)}
              </select>
            </label>
            <label>LinkedIn URL<input value={newContact.linkedin_url} onChange={set('linkedin_url')} /></label>
            <label>Phone<input value={newContact.phone} onChange={set('phone')} /></label>
          </div>
          <div className="form-actions" style={{ marginTop: '0.75rem' }}>
            <button type="submit" className="btn-primary" disabled={addingContact}>
              {addingContact ? 'Adding…' : 'Add Contact'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="error">{error}</p>}

      {/* Batch assign bar */}
      {someSelected && (
        <div className="wq-batch-bar">
          <span className="wq-batch-count">{selected.size} selected</span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Assign to:</span>
          <select
            value={assignRepId}
            onChange={(e) => setAssignRepId(e.target.value)}
            style={{ fontSize: 13, padding: '4px 8px', minWidth: 160 }}
          >
            <option value="">— Unassign —</option>
            {reps.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
          </select>
          <button
            className="btn-primary"
            style={{ fontSize: 13, padding: '5px 14px' }}
            onClick={handleBulkAssign}
            disabled={assigning}
          >
            {assigning ? 'Assigning…' : assignTarget ? `Assign to ${assignTarget.name}` : 'Unassign'}
          </button>
          <button
            style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '5px 8px' }}
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : data.contacts.length === 0 ? (
        <div className="pe-empty-state">
          <div className="pe-empty-icon">👥</div>
          <h3>No contacts found</h3>
          <p>Import contacts from a CSV or add them manually above.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="customer-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleAll}
                      style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                    />
                  </th>
                  <th>Name</th>
                  <th>Company / Title</th>
                  <th>Email</th>
                  <th>Vertical</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.contacts.map((c) => {
                  const isChecked = selected.has(c.id);
                  return (
                    <tr key={c.id} className={`customer-row${isChecked ? ' wq-row-selected' : ''}`}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOne(c.id)}
                          style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                        />
                      </td>
                      <td>
                        <button className="company-link" onClick={() => onOpenProspect({
                          wq_id: null, contact_id: c.id,
                          first_name: c.first_name, last_name: c.last_name,
                          email: c.email, linkedin_url: c.linkedin_url,
                          company: c.company, title: c.title, vertical: c.vertical, phone: c.phone,
                          status: c.status, outreach_stage: 'linkedin_view', days_in_stage: 0,
                        })}>
                          {c.first_name} {c.last_name}
                        </button>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.company || '—'}</div>
                        {c.title && <div className="muted small">{c.title}</div>}
                      </td>
                      <td className="muted small">{c.email || '—'}</td>
                      <td>{c.vertical || '—'}</td>
                      <td>
                        {c.owner_rep_name
                          ? <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{c.owner_rep_name}</span>
                          : <span className="muted" style={{ fontSize: 12 }}>—</span>}
                      </td>
                      <td>
                        <span className="badge" style={{ background: STATUS_COLOR[c.status] || '#6b7280' }}>
                          {STATUS_LABEL[c.status] || c.status}
                        </span>
                      </td>
                      <td>
                        {c.status === 'new' && currentRepId && (
                          <button className="btn-icon" title="Add to workqueue" onClick={() => handleAssignToQueue(c)}>➕</button>
                        )}
                        {c.linkedin_url && (
                          <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="btn-icon" title="LinkedIn">🔗</a>
                        )}
                        <button className="btn-icon" onClick={() => handleDelete(c.id, `${c.first_name} ${c.last_name}`)} title="Delete">🗑️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data.pages > 1 && (
            <div className="pe-pagination">
              <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
              <span className="muted" style={{ fontSize: 13 }}>
                Page {page} of {data.pages} ({data.total.toLocaleString()} total)
              </span>
              <button className="btn-secondary" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
