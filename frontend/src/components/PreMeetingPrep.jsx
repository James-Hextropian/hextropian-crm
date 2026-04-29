import { useState, useEffect, useRef } from 'react';
import { fetchPreMeetingPrep, emailPreMeetingPrep } from '../api';

const fmt = (n) => n != null
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '—';
const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d
  ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

const DOC_ICONS = {
  'application/pdf': '📄',
  'image/png': '🖼️', 'image/jpeg': '🖼️', 'image/gif': '🖼️', 'image/webp': '🖼️',
  'application/vnd.ms-excel': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.ms-powerpoint': '📊',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '📊',
};

function fmtBytes(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return (tmp.textContent || tmp.innerText || '').trim();
}

export default function PreMeetingPrep({ accountId, onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [emailTo, setEmailTo] = useState('');
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const printRef = useRef(null);

  useEffect(() => {
    fetchPreMeetingPrep(accountId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [accountId]);

  const handlePrint = () => window.print();

  const handleEmail = async () => {
    if (!emailTo.trim()) return;
    setSending(true);
    try {
      await emailPreMeetingPrep(accountId, emailTo.trim());
      setSent(true);
    } catch (e) { alert(e.message); } finally { setSending(false); }
  };

  if (loading) return (
    <div className="modal-backdrop">
      <div className="modal-box" style={{ width: 600 }}>
        <p className="muted">Generating prep document…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="modal-backdrop">
      <div className="modal-box" style={{ width: 600 }}>
        <p className="error">{error}</p>
        <button className="btn-secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );

  const { account, notes, contacts, documents, email_count } = data;

  // Compute activity metrics
  const now = new Date();
  const daysInStage = account.days_in_stage != null ? Number(account.days_in_stage) : null;
  const daysSinceContact = account.days_since_contact != null ? Number(account.days_since_contact) : null;
  const daysToClose = account.expected_close_date
    ? Math.round((new Date(account.expected_close_date) - now) / 86400000) : null;

  // Executive summary text
  const industry = account.industry ? `a ${account.industry} company` : 'a company';
  const stageText = account.deal_stage ? `currently in the ${account.deal_stage} stage` : 'in an undetermined stage';
  const valueText = account.deal_value
    ? `${fmt(account.deal_value)}${account.probability != null ? ` deal with ${account.probability}% close probability` : ' opportunity'}`
    : 'an opportunity';
  const closeText = daysToClose != null
    ? (daysToClose > 0 ? `Expected to close in ${daysToClose} day${daysToClose !== 1 ? 's' : ''} (${fmtDate(account.expected_close_date)}).`
        : daysToClose === 0 ? 'Close date is today.'
        : `Close date is ${Math.abs(daysToClose)} day${Math.abs(daysToClose) !== 1 ? 's' : ''} overdue.`)
    : '';
  const ownerText = account.owner_name ? `Account managed by ${account.owner_name}.` : '';
  const activityText = [
    daysInStage != null ? `${daysInStage} day${daysInStage !== 1 ? 's' : ''} in current stage.` : '',
    daysSinceContact != null ? `Last contact ${daysSinceContact} day${daysSinceContact !== 1 ? 's' : ''} ago.` : '',
  ].filter(Boolean).join(' ');

  const execSummary = `${account.company_name} is ${industry} ${stageText}. This is a ${valueText}. ${closeText} ${ownerText} ${activityText}`.replace(/\s+/g, ' ').trim();

  // Most recent note text for "Next Steps"
  const latestNoteText = notes.length > 0 ? stripHtml(notes[0].content) : null;
  const nextStepsExcerpt = latestNoteText && latestNoteText.length > 0
    ? (latestNoteText.length > 400 ? latestNoteText.slice(0, 400) + '…' : latestNoteText)
    : null;

  return (
    <div className="modal-backdrop">
      <div className="modal-box prep-modal" style={{ width: 820, maxHeight: '90vh', overflow: 'auto' }}>
        {/* Toolbar — hidden in print */}
        <div className="prep-toolbar no-print">
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Pre-Meeting Prep</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {sent ? (
              <span style={{ color: 'var(--green)', fontSize: 13 }}>✓ Emailed</span>
            ) : (
              <>
                <input
                  type="email"
                  placeholder="Email to rep…"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  className="search-input"
                  style={{ width: 200, fontSize: 13 }}
                />
                <button className="btn-secondary" onClick={handleEmail} disabled={sending || !emailTo.trim()}>
                  {sending ? 'Sending…' : '✉️ Send'}
                </button>
              </>
            )}
            <button className="btn-primary" onClick={handlePrint}>🖨️ Print / Save PDF</button>
            <button className="btn-icon" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        {/* Printable document */}
        <div className="prep-doc" ref={printRef}>
          <div className="prep-header">
            <h1>{account.company_name}</h1>
            <p className="prep-meta">
              Pre-Meeting Preparation Document · {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              {account.owner_name ? ` · Account Owner: ${account.owner_name}` : ''}
            </p>
          </div>

          {/* Executive Summary */}
          <section className="prep-section">
            <h2 className="prep-section-title">Executive Summary</h2>
            <div style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderLeft: '4px solid var(--accent)',
              borderRadius: 'var(--radius)',
              padding: '1rem 1.25rem',
              fontSize: 14,
              lineHeight: 1.7,
              fontFamily: 'system-ui, sans-serif',
            }}>
              {execSummary}
            </div>
          </section>

          {/* Deal Overview */}
          <section className="prep-section">
            <h2 className="prep-section-title">Deal Overview</h2>
            <div className="prep-info-grid">
              <div className="prep-info-item">
                <span className="prep-info-label">Company</span>
                <span className="prep-info-value">{account.company_name}</span>
              </div>
              {account.website_url && (
                <div className="prep-info-item">
                  <span className="prep-info-label">Website</span>
                  <span className="prep-info-value">{account.website_url}</span>
                </div>
              )}
              <div className="prep-info-item">
                <span className="prep-info-label">Industry</span>
                <span className="prep-info-value">{account.industry || '—'}</span>
              </div>
              <div className="prep-info-item">
                <span className="prep-info-label">Stage</span>
                <span className="prep-info-value">{account.deal_stage || '—'}</span>
              </div>
              <div className="prep-info-item">
                <span className="prep-info-label">Deal Value</span>
                <span className="prep-info-value">{fmt(account.deal_value)}</span>
              </div>
              <div className="prep-info-item">
                <span className="prep-info-label">Expected Close</span>
                <span className="prep-info-value">
                  {fmtDate(account.expected_close_date)}
                  {daysToClose != null && (
                    <span style={{ fontSize: 11, color: daysToClose < 0 ? 'var(--red)' : daysToClose <= 14 ? 'var(--amber)' : 'var(--muted)', marginLeft: 6 }}>
                      ({daysToClose > 0 ? `${daysToClose}d away` : daysToClose === 0 ? 'today' : `${Math.abs(daysToClose)}d overdue`})
                    </span>
                  )}
                </span>
              </div>
              <div className="prep-info-item">
                <span className="prep-info-label">Probability</span>
                <span className="prep-info-value">{account.probability != null ? `${account.probability}%` : '—'}</span>
              </div>
              <div className="prep-info-item">
                <span className="prep-info-label">Account Owner</span>
                <span className="prep-info-value">{account.owner_name || '—'}</span>
              </div>
              <div className="prep-info-item">
                <span className="prep-info-label">In Stage Since</span>
                <span className="prep-info-value">{fmtDate(account.stage_entry_date)}</span>
              </div>
              <div className="prep-info-item">
                <span className="prep-info-label">Last Contact</span>
                <span className="prep-info-value">{fmtDate(account.last_contact_date)}</span>
              </div>
            </div>
          </section>

          {/* Activity Metrics */}
          <section className="prep-section">
            <h2 className="prep-section-title">Activity Metrics</h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '10px',
              fontFamily: 'system-ui, sans-serif',
            }}>
              {[
                { label: 'Days in Stage', value: daysInStage != null ? `${daysInStage}d` : '—', highlight: daysInStage != null && daysInStage > 30 },
                { label: 'Days Since Contact', value: daysSinceContact != null ? `${daysSinceContact}d` : '—', highlight: daysSinceContact != null && daysSinceContact > 14 },
                { label: 'Notes on File', value: notes.length },
                { label: 'Documents', value: documents.length },
                { label: 'Emails Sent', value: email_count || 0 },
                { label: 'Key Contacts', value: contacts.length },
              ].map(({ label, value, highlight }) => (
                <div key={label} style={{
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '10px 14px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: highlight ? 'var(--amber)' : 'var(--accent)', marginBottom: 4 }}>
                    {value}
                  </div>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', fontWeight: 600 }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* MEDDIC Qualification Status */}
          {(account.meddic_data || account.meddic_score > 0) && (() => {
            const md = account.meddic_data || {};
            const score = account.meddic_score || 0;
            const scoreColor = score >= 71 ? '#10b981' : score >= 41 ? '#f59e0b' : '#ef4444';
            const dims = [
              { key: 'metrics',           label: 'Metrics',           snippet: md.metrics?.business_impact },
              { key: 'economic_buyer',     label: 'Economic Buyer',    snippet: md.economic_buyer?.name ? `${md.economic_buyer.name}${md.economic_buyer.title ? ` — ${md.economic_buyer.title}` : ''}` : null },
              { key: 'decision_criteria',  label: 'Decision Criteria', snippet: md.decision_criteria?.business_criteria || md.decision_criteria?.technical_criteria },
              { key: 'decision_process',   label: 'Decision Process',  snippet: md.decision_process?.process_steps },
              { key: 'identify_pain',      label: 'Identify Pain',     snippet: md.identify_pain?.primary_pain },
              { key: 'champion',           label: 'Champion',          snippet: md.champion?.name ? `${md.champion.name}${md.champion.title ? ` — ${md.champion.title}` : ''}` : null },
            ];
            return (
              <section className="prep-section">
                <h2 className="prep-section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  MEDDIC Qualification
                  <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor }}>{score}%</span>
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                  {dims.map(({ key, label, snippet }) => {
                    const hasData = !!snippet;
                    const statusColor = hasData ? '#10b981' : '#ef4444';
                    return (
                      <div key={key} style={{
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        borderLeft: `3px solid ${statusColor}`, borderRadius: 6,
                        padding: '8px 12px',
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                          {label}
                        </div>
                        {snippet
                          ? <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>{snippet.length > 100 ? snippet.slice(0, 100) + '…' : snippet}</div>
                          : <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Not captured</div>
                        }
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}

          {/* Next Steps / Most Recent Update */}
          {nextStepsExcerpt && (
            <section className="prep-section">
              <h2 className="prep-section-title">Most Recent Update</h2>
              <div style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderLeft: '4px solid var(--green)',
                borderRadius: 'var(--radius)',
                padding: '1rem 1.25rem',
                fontFamily: 'system-ui, sans-serif',
              }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>
                  {fmtDateTime(notes[0].created_at)}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{nextStepsExcerpt}</div>
              </div>
            </section>
          )}

          {/* Key Contacts */}
          <section className="prep-section">
            <h2 className="prep-section-title">Key Contacts ({contacts.length})</h2>
            {contacts.length === 0 ? (
              <p className="muted">No contacts on record.</p>
            ) : (
              <div className="prep-contacts">
                {contacts.map((c) => (
                  <div key={c.id} className="prep-contact-row">
                    <div style={{ fontWeight: 600 }}>
                      {[c.first_name, c.last_name].filter(Boolean).join(' ') || '(unnamed)'}
                      {c.is_primary && <span className="primary-badge" style={{ marginLeft: 6 }}>Primary</span>}
                    </div>
                    {c.title && <div className="muted small">{c.title}</div>}
                    <div style={{ display: 'flex', gap: 16, marginTop: 2 }}>
                      {c.email && <span className="muted small">✉ {c.email}</span>}
                      {c.phone && <span className="muted small">☎ {c.phone}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Documents */}
          <section className="prep-section">
            <h2 className="prep-section-title">Documents ({documents.length})</h2>
            {documents.length === 0 ? (
              <p className="muted">No documents attached.</p>
            ) : (
              <div className="prep-docs-list">
                {documents.map((d) => (
                  <div key={d.id} className="prep-doc-row">
                    <span className="prep-doc-icon">{DOC_ICONS[d.mime_type] || '📎'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{d.file_name}</div>
                      <div className="muted small">
                        {d.document_type || 'Document'} · {fmtDate(d.created_at)}
                        {d.deal_stage ? ` · Stage: ${d.deal_stage}` : ''}
                        {d.uploaded_by ? ` · ${d.uploaded_by}` : ''}
                        {d.file_size ? ` · ${fmtBytes(d.file_size)}` : ''}
                      </div>
                      {d.description && <div className="muted small" style={{ marginTop: 2 }}>{d.description}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Full Notes */}
          <section className="prep-section">
            <h2 className="prep-section-title">Notes ({notes.length} entries, newest first)</h2>
            {notes.length === 0 ? (
              <p className="muted">No notes on record.</p>
            ) : (
              <div className="prep-notes">
                {notes.map((note) => (
                  <div key={note.id} className="prep-note-entry">
                    <div className="prep-note-date">{fmtDateTime(note.created_at)}</div>
                    <div className="prep-note-body" dangerouslySetInnerHTML={{ __html: note.content }} />
                    {note.updated_at && note.updated_at !== note.created_at && (
                      <div className="prep-note-modified">Last edited {fmtDateTime(note.updated_at)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
