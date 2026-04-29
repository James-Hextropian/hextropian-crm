import { useState, useEffect } from 'react';
import {
  fetchContactNotes, addContactNote,
  fetchOutreachHistory,
  advanceStage, markNoInterest, convertContact,
  fetchReps,
} from '../api';
import { OUTREACH_STAGES } from './WorkQueue';

const STAGE_INDEX = Object.fromEntries(OUTREACH_STAGES.map((s, i) => [s.key, i]));
const NO_INTEREST_REASONS = ['Budget constraints', 'Not the right fit', 'Competitor / existing solution', 'Not the right time', 'Wrong contact', 'No response', 'Other'];
const DEAL_STAGES = ['Prospecting', 'Qualification', 'Discovery', 'Demo'];

const fmtDateTime = (d) => d
  ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

function StageTimeline({ currentStage, history }) {
  const doneKeys = new Set(history.filter((h) => STAGE_INDEX[h.stage] !== undefined).map((h) => h.stage));
  const currentIdx = STAGE_INDEX[currentStage] ?? 0;

  return (
    <div className="ps-timeline">
      {OUTREACH_STAGES.map((s, i) => {
        const isDone    = i < currentIdx || doneKeys.has(s.key);
        const isCurrent = i === currentIdx;
        return (
          <div key={s.key} className={`ps-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}>
            <div className="ps-step-icon">
              {isDone ? '✓' : s.icon}
            </div>
            <div className="ps-step-label">{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function ProspectCard({ entry, currentRepId, onClose, onConverted, onUpdated }) {
  const [notes, setNotes]       = useState([]);
  const [history, setHistory]   = useState([]);
  const [reps, setReps]         = useState([]);
  const [newNote, setNewNote]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [advanceNote, setAdvanceNote] = useState('');
  const [showAdvanceNote, setShowAdvanceNote] = useState(false);

  // No interest modal
  const [showNoInterest, setShowNoInterest]   = useState(false);
  const [noInterestReason, setNoInterestReason] = useState('');

  // Convert modal
  const [showConvert, setShowConvert]   = useState(false);
  const [convertStage, setConvertStage] = useState('Prospecting');
  const [convertOwner, setConvertOwner] = useState(currentRepId || '');
  const [converting, setConverting]     = useState(false);

  const isAtLastStage = STAGE_INDEX[entry.outreach_stage] >= OUTREACH_STAGES.length - 1;

  useEffect(() => {
    if (!entry.contact_id) return;
    Promise.all([
      fetchContactNotes(entry.contact_id),
      fetchOutreachHistory(entry.contact_id),
      fetchReps(),
    ]).then(([n, h, r]) => { setNotes(n); setHistory(h); setReps(r); }).catch(() => {});
  }, [entry.contact_id]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const note = await addContactNote(entry.contact_id, newNote, currentRepId);
      setNotes((ns) => [note, ...ns]);
      setNewNote('');
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const handleAdvance = async () => {
    setAdvancing(true);
    try {
      const updated = await advanceStage(entry.contact_id, currentRepId, advanceNote || null);
      setAdvanceNote('');
      setShowAdvanceNote(false);
      const updatedEntry = { ...entry, outreach_stage: updated.outreach_stage, days_in_stage: 0 };
      onUpdated?.(updatedEntry);
      // Refresh history
      const h = await fetchOutreachHistory(entry.contact_id);
      setHistory(h);
    } catch (e) { alert(e.message); } finally { setAdvancing(false); }
  };

  const handleNoInterest = async () => {
    if (!noInterestReason) return alert('Please select a reason.');
    try {
      await markNoInterest(entry.contact_id, noInterestReason, currentRepId);
      onClose();
    } catch (e) { alert(e.message); }
  };

  const handleConvert = async () => {
    setConverting(true);
    try {
      const { customer } = await convertContact(entry.contact_id, {
        deal_stage: convertStage,
        owner_id: convertOwner || null,
        rep_id: currentRepId,
      });
      onConverted(customer);
    } catch (e) { alert(e.message); } finally { setConverting(false); }
  };

  const fullName = `${entry.first_name || ''} ${entry.last_name || ''}`.trim();

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal ps-modal">
        {/* Header */}
        <div className="ps-modal-header">
          <div>
            <h2 className="ps-contact-name">{fullName || 'Unknown'}</h2>
            <div className="ps-contact-meta">
              {entry.title && <span>{entry.title}</span>}
              {entry.title && entry.company && <span> · </span>}
              {entry.company && <span style={{ fontWeight: 600 }}>{entry.company}</span>}
              {entry.vertical && <span className="muted"> · {entry.vertical}</span>}
            </div>
            <div className="ps-contact-links">
              {entry.email && <a href={`mailto:${entry.email}`} className="ps-link">✉️ {entry.email}</a>}
              {entry.phone && <span className="muted">📞 {entry.phone}</span>}
              {entry.linkedin_url && (
                <a href={entry.linkedin_url} target="_blank" rel="noreferrer" className="ps-link">
                  🔗 LinkedIn
                </a>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span className="muted" style={{ fontSize: 12 }}>{entry.days_in_stage}d in stage</span>
            <button className="btn-secondary" style={{ padding: '6px 12px' }} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Stage timeline */}
        <div className="ps-section">
          <StageTimeline currentStage={entry.outreach_stage} history={history} />
        </div>

        {/* Action buttons */}
        <div className="ps-actions">
          {!showAdvanceNote ? (
            <button
              className="btn-primary"
              onClick={() => setShowAdvanceNote(true)}
              disabled={advancing || isAtLastStage}
              title={isAtLastStage ? 'Sequence complete — Convert or mark No Interest' : ''}
            >
              {advancing ? 'Advancing…' : isAtLastStage ? '✓ Sequence Complete' : `↑ Mark Stage Done`}
            </button>
          ) : (
            <div className="ps-advance-note-row">
              <input
                placeholder="Optional note for this stage…"
                value={advanceNote}
                onChange={(e) => setAdvanceNote(e.target.value)}
                style={{ flex: 1 }}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleAdvance()}
              />
              <button className="btn-primary" onClick={handleAdvance} disabled={advancing}>
                {advancing ? '…' : 'Done'}
              </button>
              <button className="btn-secondary" onClick={() => { setShowAdvanceNote(false); setAdvanceNote(''); }}>
                Cancel
              </button>
            </div>
          )}
          <button className="btn-primary ps-convert-btn" onClick={() => setShowConvert(true)}>
            ⚡ Convert to Account
          </button>
          <button className="btn-secondary ps-noint-btn" onClick={() => setShowNoInterest(true)}>
            ✕ No Interest
          </button>
        </div>

        <div className="ps-two-col">
          {/* Notes column */}
          <div className="ps-notes-col">
            <h4 className="ps-section-title">Notes</h4>
            <div className="ps-note-input">
              <textarea
                rows={3}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Call notes, objections, follow-up details…"
              />
              <button className="btn-primary" style={{ alignSelf: 'flex-end' }} onClick={handleAddNote} disabled={saving || !newNote.trim()}>
                {saving ? 'Saving…' : 'Add Note'}
              </button>
            </div>
            <div className="ps-notes-list">
              {notes.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>No notes yet.</p>
              ) : notes.map((n) => (
                <div key={n.id} className="ps-note-card">
                  <div className="ps-note-body">{n.content}</div>
                  <div className="ps-note-meta">
                    {n.rep_name && <span>{n.rep_name} · </span>}
                    {fmtDateTime(n.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* History column */}
          <div className="ps-history-col">
            <h4 className="ps-section-title">Outreach History</h4>
            {history.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>No activity yet.</p>
            ) : (
              <div className="ps-history-list">
                {history.map((h) => (
                  <div key={h.id} className="ps-history-item">
                    <div className="ps-history-stage">
                      {OUTREACH_STAGES.find((s) => s.key === h.stage)?.icon || '📌'}{' '}
                      {OUTREACH_STAGES.find((s) => s.key === h.stage)?.label || h.stage}
                    </div>
                    <div className="ps-history-meta">
                      {fmtDateTime(h.completed_at)}
                      {h.rep_name && ` · ${h.rep_name}`}
                    </div>
                    {h.notes && <div className="ps-history-notes">{h.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* No Interest modal */}
      {showNoInterest && (
        <div className="modal-overlay" style={{ zIndex: 300 }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <h3 style={{ marginBottom: '1rem' }}>Mark as No Interest</h3>
            <label style={{ marginBottom: '1rem', display: 'block' }}>
              Reason
              <select value={noInterestReason} onChange={(e) => setNoInterestReason(e.target.value)} style={{ marginTop: 6 }}>
                <option value="">— Select reason —</option>
                {NO_INTEREST_REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => setShowNoInterest(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleNoInterest} style={{ background: 'var(--red)' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Convert modal */}
      {showConvert && (
        <div className="modal-overlay" style={{ zIndex: 300 }}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <h3 style={{ marginBottom: '1rem' }}>Convert to CRM Account</h3>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: '1.25rem' }}>
              Creates a new account for <strong>{entry.company || fullName}</strong> in the CRM pipeline.
            </div>
            <div className="form-grid">
              <label>
                Initial Deal Stage
                <select value={convertStage} onChange={(e) => setConvertStage(e.target.value)}>
                  {DEAL_STAGES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>
                Account Owner
                <select value={convertOwner} onChange={(e) => setConvertOwner(e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
            </div>
            <div className="form-actions" style={{ marginTop: '1.25rem' }}>
              <button className="btn-secondary" onClick={() => setShowConvert(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleConvert} disabled={converting} style={{ background: 'var(--green)' }}>
                {converting ? 'Converting…' : '⚡ Convert'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
