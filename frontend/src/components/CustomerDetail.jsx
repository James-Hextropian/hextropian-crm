import { useState, useEffect, useCallback } from 'react';
import {
  fetchCustomer, updateCustomer,
  fetchNotes, addNote, updateNote, deleteNote,
  fetchContacts, deleteContact,
  fetchDocuments,
  setWinLossReason,
  fetchReps,
} from '../api';

import CustomerForm from './CustomerForm';
import ContactForm from './ContactForm';
import EmailModal from './EmailModal';
import RichTextEditor from './RichTextEditor';
import DocumentManager from './DocumentManager';
import PreMeetingPrep from './PreMeetingPrep';
import DealReview from './DealReview';
import MeddicPanel from './meddic/MeddicPanel';
import { authFetch } from '../context/AuthContext';

const STAGES = ['Prospecting', 'Qualification', 'Discovery', 'Demo', 'Negotiation', 'POC Planned', 'POC Active', 'Closed-Won', 'Closed-Lost', 'Post-Sale'];
const PROBS = [10, 25, 50, 75, 90, 100];

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

const WIN_LOSS_REASONS = [
  '', 'Won — Budget Fit', 'Won — Technical Fit', 'Won — Relationship / Trust',
  'Won — Competitive Advantage', 'Won — Timing',
  'Lost — Budget / Price', 'Lost — Competitor', 'Lost — No Internal Champion',
  'Lost — Technical Gap', 'Lost — No Decision / Stalled', 'Lost — Wrong Timing', 'Lost — No Interest',
];

const CLOSED_STAGES = new Set(['Closed-Won', 'Closed-Lost', 'Post-Sale']);

const fmt = (n) => n != null
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '—';
const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d
  ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const stripHtml = (html) => {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
};

export default function CustomerDetail({ customerId, currentRepId, onBack }) {
  const [customer,  setCustomer]  = useState(null);
  const [notes,     setNotes]     = useState([]);
  const [contacts,  setContacts]  = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const [newNote,       setNewNote]       = useState('');
  const [noteEditorKey, setNoteEditorKey] = useState(0);
  const [savingNote,    setSavingNote]    = useState(false);
  const [editingNote,   setEditingNote]   = useState(null);

  // Notes controls
  const [noteSort,      setNoteSort]      = useState('desc');
  const [noteDateFrom,  setNoteDateFrom]  = useState('');
  const [noteDateTo,    setNoteDateTo]    = useState('');
  const [noteView,      setNoteView]      = useState('list'); // 'list' | 'timeline'

  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editingContact,  setEditingContact]  = useState(null);
  const [emailingContact, setEmailingContact] = useState(null);

  const [showPrep,   setShowPrep]   = useState(false);
  const [showReview, setShowReview] = useState(false);

  const [winLoss,   setWinLoss]   = useState('');
  const [savingWL,  setSavingWL]  = useState(false);

  const [meddicData,  setMeddicData]  = useState({});
  const [meddicScore, setMeddicScore] = useState(0);

  const [reps,        setReps]        = useState([]);
  const [quickEdit,   setQuickEdit]   = useState(false);
  const [quickForm,   setQuickForm]   = useState({});
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError,  setQuickError]  = useState(null);
  const [quickOk,     setQuickOk]     = useState(false);

  useEffect(() => { fetchReps().then(setReps).catch(() => {}); }, []);

  useEffect(() => {
    if (customer) {
      setQuickForm({
        deal_stage: customer.deal_stage || 'Prospecting',
        expected_close_date: customer.expected_close_date ? customer.expected_close_date.slice(0, 10) : '',
        probability: customer.probability ?? '',
        owner_id: customer.owner_id ?? '',
      });
    }
  }, [customer]);

  const handleQuickSave = async () => {
    setQuickSaving(true);
    setQuickError(null);
    setQuickOk(false);
    try {
      const payload = {
        company_name: customer.company_name,
        contact_person: customer.contact_person || '',
        email: customer.email || '',
        phone: customer.phone || '',
        industry: customer.industry || '',
        notes: customer.notes || '',
        deal_value: customer.deal_value || null,
        last_contact_date: customer.last_contact_date ? customer.last_contact_date.slice(0, 10) : null,
        deal_stage: quickForm.deal_stage,
        expected_close_date: quickForm.expected_close_date || null,
        probability: quickForm.probability === '' ? null : Number(quickForm.probability),
        owner_id: quickForm.owner_id === '' ? null : Number(quickForm.owner_id),
      };
      const updated = await updateCustomer(customerId, payload);
      setCustomer(updated);
      setQuickEdit(false);
      setQuickOk(true);
      setTimeout(() => setQuickOk(false), 3000);
    } catch (e) {
      setQuickError(e.message);
    } finally {
      setQuickSaving(false);
    }
  };

  const loadNotes = useCallback(async () => {
    const params = { sort: noteSort };
    if (noteDateFrom) params.date_from = noteDateFrom;
    if (noteDateTo)   params.date_to   = noteDateTo;
    try {
      const n = await fetchNotes(customerId, params);
      setNotes(n);
    } catch {}
  }, [customerId, noteSort, noteDateFrom, noteDateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, n, cts, docs, meddic] = await Promise.all([
        fetchCustomer(customerId),
        fetchNotes(customerId, { sort: noteSort }),
        fetchContacts(customerId),
        fetchDocuments(customerId),
        authFetch(`/api/meddic/${customerId}`).catch(() => ({ meddic_data: {}, meddic_score: 0 })),
      ]);
      setCustomer(c);
      setNotes(n);
      setContacts(cts);
      setDocuments(docs);
      setWinLoss(c.win_loss_reason || '');
      setMeddicData(meddic.meddic_data || {});
      setMeddicScore(meddic.meddic_score || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!loading) loadNotes(); }, [noteSort, noteDateFrom, noteDateTo]);

  const handleAddNote = async () => {
    if (!stripHtml(newNote).trim()) return;
    setSavingNote(true);
    try {
      await addNote(customerId, newNote);
      setNewNote('');
      setNoteEditorKey((k) => k + 1);
      await loadNotes();
    } catch (e) { alert(e.message); } finally { setSavingNote(false); }
  };

  const handleUpdateNote = async (noteId, content) => {
    try {
      await updateNote(customerId, noteId, content);
      setEditingNote(null);
      await loadNotes();
    } catch (e) { alert(e.message); }
  };

  const handleDeleteNote = async (noteId) => {
    if (!confirm('Delete this note?')) return;
    try {
      await deleteNote(customerId, noteId);
      setNotes((ns) => ns.filter((n) => n.id !== noteId));
    } catch (e) { alert(e.message); }
  };

  const handleSaveWinLoss = async () => {
    setSavingWL(true);
    try {
      const updated = await setWinLossReason(customerId, winLoss || null);
      setCustomer((c) => ({ ...c, win_loss_reason: updated.win_loss_reason }));
    } catch (e) { alert(e.message); } finally { setSavingWL(false); }
  };

  const handleContactSaved = (contact) => {
    setContacts((cs) => {
      let updated = contact.is_primary ? cs.map((c) => ({ ...c, is_primary: false })) : [...cs];
      const idx = updated.findIndex((c) => c.id === contact.id);
      updated = idx >= 0 ? updated.map((c) => c.id === contact.id ? contact : c) : [...updated, contact];
      return updated.sort((a, b) =>
        (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || (a.first_name || '').localeCompare(b.first_name || '')
      );
    });
    setEditingContact(null);
  };

  const handleDeleteContact = async (contactId, name) => {
    if (!confirm(`Delete contact ${name}?`)) return;
    try {
      await deleteContact(customerId, contactId);
      setContacts((cs) => cs.filter((c) => c.id !== contactId));
    } catch (e) { alert(e.message); }
  };

  const contactDisplayName = (c) =>
    [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed Contact';

  if (loading) return <p className="muted">Loading…</p>;
  if (error)   return <p className="error">{error}</p>;
  if (!customer) return null;

  const weightedVal = customer.deal_value != null && customer.probability != null
    ? customer.deal_value * customer.probability / 100
    : null;

  const isClosed = CLOSED_STAGES.has(customer.deal_stage);

  return (
    <div className="account-detail">
      <div className="detail-back">
        <button className="btn-secondary" onClick={onBack}>← Back to Accounts</button>
      </div>

      {/* ── Account Info ── */}
      <div className="detail-section">
        <div className="account-info-header">
          <div>
            <h1 className="account-name">{customer.company_name}</h1>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: STAGE_COLOR[customer.deal_stage] || '#6b7280' }}>
                {customer.deal_stage || 'No stage'}
              </span>
              {!CLOSED_STAGES.has(customer.deal_stage) && (
                <span className="badge" style={{
                  background: meddicScore >= 71 ? '#10b981' : meddicScore >= 41 ? '#f59e0b' : '#ef4444',
                  fontSize: 11,
                }}>
                  MEDDIC {meddicScore}%
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowPrep(true)}>📋 Pre-Meeting Prep</button>
            <button className="btn-secondary" onClick={() => setShowReview(true)}>📊 Deal Review</button>
            <button
              className={quickEdit ? 'btn-primary' : 'btn-secondary'}
              onClick={() => { setQuickEdit((v) => !v); setQuickError(null); }}
            >
              {quickEdit ? '✕ Cancel' : '✏️ Update Deal'}
            </button>
            <button className="btn-secondary" onClick={() => setEditingCustomer(true)}>Edit Account</button>
          </div>
        </div>

        {/* Inline quick-update panel */}
        {quickEdit && (
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem 1.25rem', marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="info-label">Deal Stage</span>
                <select
                  value={quickForm.deal_stage}
                  onChange={(e) => setQuickForm((f) => ({ ...f, deal_stage: e.target.value }))}
                  style={{ fontSize: 13, padding: '6px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
                >
                  {STAGES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="info-label">Expected Close</span>
                <input
                  type="date"
                  value={quickForm.expected_close_date}
                  onChange={(e) => setQuickForm((f) => ({ ...f, expected_close_date: e.target.value }))}
                  style={{ fontSize: 13, padding: '6px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="info-label">Probability</span>
                <select
                  value={quickForm.probability}
                  onChange={(e) => setQuickForm((f) => ({ ...f, probability: e.target.value }))}
                  style={{ fontSize: 13, padding: '6px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
                >
                  <option value="">— None —</option>
                  {PROBS.map((p) => <option key={p} value={p}>{p}%</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="info-label">Account Owner</span>
                <select
                  value={quickForm.owner_id}
                  onChange={(e) => setQuickForm((f) => ({ ...f, owner_id: e.target.value }))}
                  style={{ fontSize: 13, padding: '6px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
                >
                  <option value="">— Unassigned —</option>
                  {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 1 }}>
                <button className="btn-primary" disabled={quickSaving} onClick={handleQuickSave} style={{ fontSize: 13 }}>
                  {quickSaving ? 'Saving…' : 'Save Changes'}
                </button>
                <button className="btn-secondary" onClick={() => { setQuickEdit(false); setQuickError(null); }} style={{ fontSize: 13 }}>
                  Cancel
                </button>
                {quickError && <span className="error" style={{ fontSize: 12 }}>{quickError}</span>}
              </div>
            </div>
          </div>
        )}
        {quickOk && !quickEdit && (
          <div style={{ color: 'var(--green)', fontSize: 13, marginTop: 6 }}>✓ Deal updated successfully</div>
        )}

        <div className="account-info-grid">
          {customer.industry && (
            <div className="info-item">
              <span className="info-label">Industry</span>
              <span className="info-value">{customer.industry}</span>
            </div>
          )}
          <div className="info-item">
            <span className="info-label">Deal Value</span>
            <span className="info-value">{fmt(customer.deal_value)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Expected Close</span>
            <span className="info-value">{fmtDate(customer.expected_close_date)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Probability</span>
            <span className="info-value">
              {customer.probability != null
                ? <span className="badge" style={{ background: PROB_COLOR(customer.probability) }}>{customer.probability}%</span>
                : '—'}
            </span>
          </div>
          {weightedVal != null && (
            <div className="info-item">
              <span className="info-label">Weighted Value</span>
              <span className="info-value">{fmt(weightedVal)}</span>
            </div>
          )}
          <div className="info-item">
            <span className="info-label">Account Owner</span>
            <span className="info-value">
              {customer.owner_name
                ? <span className="owner-chip">{customer.owner_name}</span>
                : <span className="muted">Unassigned</span>}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">In Stage Since</span>
            <span className="info-value">{fmtDate(customer.stage_entry_date)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Days in Stage</span>
            <span className="info-value">{customer.days_in_stage != null ? `${customer.days_in_stage} days` : '—'}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Last Contact</span>
            <span className="info-value">{fmtDate(customer.last_contact_date)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Account Since</span>
            <span className="info-value">{fmtDate(customer.created_at)}</span>
          </div>
          {customer.contact_person && (
            <div className="info-item">
              <span className="info-label">Legacy Contact</span>
              <span className="info-value">{customer.contact_person}</span>
            </div>
          )}
          {customer.email && (
            <div className="info-item">
              <span className="info-label">Email</span>
              <span className="info-value"><a href={`mailto:${customer.email}`}>{customer.email}</a></span>
            </div>
          )}
          {customer.phone && (
            <div className="info-item">
              <span className="info-label">Phone</span>
              <span className="info-value">{customer.phone}</span>
            </div>
          )}
          {customer.notes && (
            <div className="info-item info-full-width">
              <span className="info-label">Legacy Notes</span>
              <span className="info-value info-legacy-notes">{customer.notes}</span>
            </div>
          )}
        </div>

        {/* Win/Loss reason row — only on closed deals */}
        {isClosed && (
          <div className="win-loss-row">
            <span className="info-label" style={{ minWidth: 140 }}>Win / Loss Reason</span>
            <select value={winLoss} onChange={(e) => setWinLoss(e.target.value)} style={{ flex: 1, maxWidth: 320 }}>
              <option value="">— Not set —</option>
              {WIN_LOSS_REASONS.filter(Boolean).map((r) => <option key={r}>{r}</option>)}
            </select>
            <button className="btn-secondary" onClick={handleSaveWinLoss} disabled={savingWL} style={{ fontSize: 13 }}>
              {savingWL ? 'Saving…' : 'Save'}
            </button>
            {customer.win_loss_reason && (
              <span style={{ color: 'var(--green)', fontSize: 13 }}>✓ {customer.win_loss_reason}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Notes ── */}
      <div className="detail-section">
        <div className="section-header" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h2 className="section-title">Notes ({notes.length})</h2>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={noteSort} onChange={(e) => setNoteSort(e.target.value)} style={{ fontSize: 12, padding: '4px 8px' }}>
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
            <input
              type="date"
              value={noteDateFrom}
              onChange={(e) => setNoteDateFrom(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px' }}
              title="From date"
            />
            <span className="muted small">–</span>
            <input
              type="date"
              value={noteDateTo}
              onChange={(e) => setNoteDateTo(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px' }}
              title="To date"
            />
            {(noteDateFrom || noteDateTo) && (
              <button className="btn-icon" title="Clear filter" onClick={() => { setNoteDateFrom(''); setNoteDateTo(''); }}>✕</button>
            )}
            <button
              className="btn-secondary"
              style={{ fontSize: 12, padding: '4px 10px', background: noteView === 'timeline' ? 'var(--accent)' : undefined, color: noteView === 'timeline' ? '#fff' : undefined }}
              onClick={() => setNoteView((v) => v === 'timeline' ? 'list' : 'timeline')}
            >
              {noteView === 'timeline' ? '≡ List' : '◎ Timeline'}
            </button>
          </div>
        </div>

        <div className="note-editor-wrap">
          <RichTextEditor key={noteEditorKey} value={newNote} onChange={setNewNote} placeholder="Add a note…" />
          <div className="note-editor-actions">
            <button className="btn-primary" disabled={savingNote || !stripHtml(newNote).trim()} onClick={handleAddNote}>
              {savingNote ? 'Saving…' : 'Add Note'}
            </button>
          </div>
        </div>

        {notes.length === 0 ? (
          <p className="muted" style={{ marginTop: '0.5rem' }}>No notes yet.</p>
        ) : noteView === 'timeline' ? (
          <div className="notes-timeline">
            {notes.map((note, i) => (
              <div key={note.id} className="timeline-entry">
                <div className="timeline-col">
                  <div className="timeline-dot" />
                  {i < notes.length - 1 && <div className="timeline-line" />}
                </div>
                <div className="timeline-card">
                  <div className="timeline-date">{fmtDateTime(note.created_at)}</div>
                  {editingNote?.id === note.id ? (
                    <>
                      <RichTextEditor value={editingNote.content} onChange={(v) => setEditingNote((n) => ({ ...n, content: v }))} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button className="btn-secondary" onClick={() => setEditingNote(null)}>Cancel</button>
                        <button className="btn-primary" onClick={() => handleUpdateNote(note.id, editingNote.content)}>Save</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="note-body" dangerouslySetInnerHTML={{ __html: note.content }} />
                      {note.updated_at !== note.created_at && (
                        <div className="muted small" style={{ marginTop: 4 }}>Edited {fmtDateTime(note.updated_at)}</div>
                      )}
                      <div className="note-actions" style={{ marginTop: 8 }}>
                        <button className="btn-icon" onClick={() => setEditingNote({ id: note.id, content: note.content })} title="Edit">✏️</button>
                        <button className="btn-icon" onClick={() => handleDeleteNote(note.id)} title="Delete">🗑️</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="notes-list">
            {notes.map((note) => (
              <div key={note.id} className="note-card">
                {editingNote?.id === note.id ? (
                  <>
                    <div className="note-editor-wrap">
                      <RichTextEditor value={editingNote.content} onChange={(v) => setEditingNote((n) => ({ ...n, content: v }))} />
                    </div>
                    <div className="note-editor-actions" style={{ background: 'transparent', borderTop: 'none', paddingTop: 8 }}>
                      <button className="btn-secondary" onClick={() => setEditingNote(null)}>Cancel</button>
                      <button className="btn-primary" onClick={() => handleUpdateNote(note.id, editingNote.content)}>Save</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="note-body" dangerouslySetInnerHTML={{ __html: note.content }} />
                    <div className="note-footer">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span className="note-timestamp">{fmtDateTime(note.created_at)}</span>
                        {note.updated_at !== note.created_at && (
                          <span className="note-timestamp" style={{ color: 'var(--muted)', fontSize: 11 }}>
                            Edited {fmtDateTime(note.updated_at)}
                          </span>
                        )}
                      </div>
                      <div className="note-actions">
                        <button className="btn-icon" onClick={() => setEditingNote({ id: note.id, content: note.content })} title="Edit">✏️</button>
                        <button className="btn-icon" onClick={() => handleDeleteNote(note.id)} title="Delete">🗑️</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Documents ── */}
      <div className="detail-section">
        <DocumentManager
          accountId={customerId}
          dealStage={customer.deal_stage}
          repName={customer.owner_name}
          documents={documents}
          onDocsChange={setDocuments}
        />
      </div>

      {/* ── Contacts ── */}
      <div className="detail-section">
        <div className="section-header">
          <h2 className="section-title">Contacts</h2>
          <button className="btn-primary" onClick={() => setEditingContact(false)}>+ Add Contact</button>
        </div>
        {contacts.length === 0 ? (
          <p className="muted">No contacts yet.</p>
        ) : (
          <div className="contacts-grid">
            {contacts.map((contact) => (
              <div key={contact.id} className={`contact-card${contact.is_primary ? ' contact-primary' : ''}`}>
                {contact.is_primary && <span className="primary-badge">Primary</span>}
                <div className="contact-name">{contactDisplayName(contact)}</div>
                {contact.title && <div className="contact-title">{contact.title}</div>}
                {contact.email && <div className="contact-detail"><a href={`mailto:${contact.email}`} className="contact-link">{contact.email}</a></div>}
                {contact.phone && <div className="contact-detail">{contact.phone}</div>}
                <div className="contact-actions">
                  {contact.email && (
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEmailingContact(contact)}>
                      ✉️ Email
                    </button>
                  )}
                  <button className="btn-icon" onClick={() => setEditingContact(contact)} title="Edit">✏️</button>
                  <button className="btn-icon" onClick={() => handleDeleteContact(contact.id, contactDisplayName(contact))} title="Delete">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MEDDIC ── */}
      {!CLOSED_STAGES.has(customer.deal_stage) && (
        <MeddicPanel
          customerId={customerId}
          initialData={meddicData}
          initialScore={meddicScore}
          onScoreChange={(score, data) => { setMeddicScore(score); setMeddicData(data); }}
        />
      )}

      {/* ── Modals ── */}
      {editingCustomer && (
        <CustomerForm customer={customer} onSaved={(saved) => { setCustomer(saved); setEditingCustomer(false); }} onCancel={() => setEditingCustomer(false)} />
      )}
      {editingContact !== null && (
        <ContactForm customerId={customerId} contact={editingContact || null} onSaved={handleContactSaved} onCancel={() => setEditingContact(null)} />
      )}
      {emailingContact && (
        <EmailModal
          customer={{ id: customer.id, company_name: customer.company_name, email: emailingContact.email, contact_person: contactDisplayName(emailingContact) }}
          onClose={() => setEmailingContact(null)}
          onSent={() => { setEmailingContact(null); load(); }}
        />
      )}
      {showPrep && (
        <PreMeetingPrep accountId={customerId} onClose={() => setShowPrep(false)} />
      )}
      {showReview && (
        <DealReview accountId={customerId} dealStage={customer.deal_stage} onClose={() => setShowReview(false)} />
      )}
    </div>
  );
}
