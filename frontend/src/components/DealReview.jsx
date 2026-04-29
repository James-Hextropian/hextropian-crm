import { useState, useEffect } from 'react';
import { fetchDealReview, saveDealReview, setWinLossReason } from '../api';

const fmt = (n) => n != null
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '—';
const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d
  ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

const STAGE_COLOR = {
  'Prospecting': '#6366f1', 'Qualification': '#8b5cf6', 'Discovery': '#3b82f6',
  'Demo': '#06b6d4', 'Negotiation': '#f59e0b', 'POC Planned': '#f97316',
  'POC Active': '#ef4444', 'Closed-Won': '#10b981', 'Closed-Lost': '#6b7280', 'Post-Sale': '#14b8a6',
};

const WIN_LOSS_REASONS = [
  '',
  'Won — Budget Fit', 'Won — Technical Fit', 'Won — Relationship / Trust',
  'Won — Competitive Advantage', 'Won — Timing',
  'Lost — Budget / Price', 'Lost — Competitor', 'Lost — No Internal Champion',
  'Lost — Technical Gap', 'Lost — No Decision / Stalled', 'Lost — Wrong Timing', 'Lost — No Interest',
];

const CLOSED_STAGES = new Set(['Closed-Won', 'Closed-Lost', 'Post-Sale']);

function StageProgressionChart({ stageTimeline, totalDays }) {
  if (!stageTimeline.length) return null;
  const maxDays = Math.max(...stageTimeline.map((s) => s.days), 1);
  const W = 580;
  const BAR_H = 22;
  const ROW_H = 36;
  const LABEL_W = 110;
  const DAY_W = 52;
  const BAR_W = W - LABEL_W - DAY_W - 8;
  const H = stageTimeline.length * ROW_H;

  return (
    <div style={{ marginBottom: '1rem' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }} aria-label="Stage progression chart">
        {stageTimeline.map((s, i) => {
          const barWidth = maxDays > 0 ? (s.days / maxDays) * BAR_W : 0;
          const y = i * ROW_H + (ROW_H - BAR_H) / 2;
          const labelY = i * ROW_H + ROW_H / 2;
          const color = STAGE_COLOR[s.to_stage] || '#6b7280';

          return (
            <g key={s.id}>
              <text x={LABEL_W - 6} y={labelY} textAnchor="end" dominantBaseline="middle" fill="#e8eaf0" fontSize="10" fontWeight="600">
                {s.to_stage}
              </text>
              <rect x={LABEL_W} y={y} width={BAR_W} height={BAR_H} rx={4} fill="#22263a" />
              {barWidth > 0 && (
                <rect x={LABEL_W} y={y} width={barWidth} height={BAR_H} rx={4} fill={color} opacity={s.exited_at ? 0.9 : 0.5} />
              )}
              {!s.exited_at && barWidth > 20 && (
                <text x={LABEL_W + barWidth / 2} y={labelY} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="9" opacity={0.8}>
                  current
                </text>
              )}
              <text x={LABEL_W + BAR_W + 6} y={labelY} dominantBaseline="middle" fill="#7b82a0" fontSize="10" fontWeight="600">
                {s.days}d
              </text>
            </g>
          );
        })}
      </svg>
      {totalDays != null && (
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          Total deal length: {totalDays} day{totalDays !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

export default function DealReview({ accountId, dealStage, onClose }) {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [winLoss,     setWinLoss]     = useState('');
  const [savingReason, setSavingReason] = useState(false);
  const [archived,    setArchived]    = useState(false);

  // Win/Loss analysis fields
  const [analysis, setAnalysis] = useState({
    competitor: '',
    key_decision_maker: '',
    budget_impact: '',
  });

  // Learnings & insights (printed but editable before print)
  const [learnings, setLearnings] = useState({
    what_worked: '',
    to_improve: '',
    next_steps: '',
  });

  useEffect(() => {
    fetchDealReview(accountId)
      .then((d) => {
        setData(d);
        setWinLoss(d.account.win_loss_reason || '');
        // Pre-fill decision maker from primary contact
        const primary = d.contacts.find((c) => c.is_primary) || d.contacts[0];
        if (primary) {
          setAnalysis((a) => ({
            ...a,
            key_decision_maker: [primary.first_name, primary.last_name].filter(Boolean).join(' ') + (primary.title ? ` (${primary.title})` : ''),
          }));
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [accountId]);

  const handleSaveReason = async () => {
    setSavingReason(true);
    try {
      await setWinLossReason(accountId, winLoss || null);
    } catch (e) { alert(e.message); } finally { setSavingReason(false); }
  };

  const handleArchive = async () => {
    if (!data) return;
    try {
      await saveDealReview(accountId, { ...data, analysis, learnings }, null);
      setArchived(true);
    } catch (e) { alert(e.message); }
  };

  if (loading) return (
    <div className="modal-backdrop">
      <div className="modal-box" style={{ width: 600 }}>
        <p className="muted">Building deal review…</p>
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

  const { account, notes, contacts, stageTimeline, documents, total_days } = data;
  const isClosed = CLOSED_STAGES.has(account.deal_stage);

  // Sales cycle metrics
  const longestStage = stageTimeline.length > 0
    ? stageTimeline.reduce((max, s) => s.days > max.days ? s : max, stageTimeline[0])
    : null;
  const avgDaysPerStage = stageTimeline.length > 0
    ? Math.round(stageTimeline.reduce((sum, s) => sum + s.days, 0) / stageTimeline.length)
    : null;

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text)',
    fontSize: 13,
    fontFamily: 'system-ui, sans-serif',
    resize: 'vertical',
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-box prep-modal" style={{ width: 860, maxHeight: '92vh', overflow: 'auto' }}>
        {/* Toolbar */}
        <div className="prep-toolbar no-print">
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Deal Review — {account.company_name}</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {archived
              ? <span style={{ color: 'var(--green)', fontSize: 13 }}>✓ Archived</span>
              : <button className="btn-secondary" onClick={handleArchive}>📦 Archive Review</button>
            }
            <button className="btn-primary" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
            <button className="btn-icon" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        <div className="prep-doc">
          <div className="prep-header">
            <h1>{account.company_name}</h1>
            <p className="prep-meta">
              Deal Review · {account.deal_stage}
              {account.deal_stage === 'Closed-Won' && ' 🏆'}
              {account.deal_stage === 'Closed-Lost' && ' ✗'}
              {' · '}{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          {/* Win/loss reason — only for closed deals */}
          {isClosed && (
            <section className="prep-section">
              <h2 className="prep-section-title">Win / Loss Outcome</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={winLoss}
                  onChange={(e) => setWinLoss(e.target.value)}
                  style={{ flex: 1, maxWidth: 340, padding: '7px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}
                >
                  <option value="">— Select reason —</option>
                  {WIN_LOSS_REASONS.filter(Boolean).map((r) => <option key={r}>{r}</option>)}
                </select>
                <button className="btn-primary no-print" disabled={savingReason} onClick={handleSaveReason}>
                  {savingReason ? 'Saving…' : 'Save'}
                </button>
                {winLoss && <span style={{ fontWeight: 700, color: winLoss.startsWith('Won') ? 'var(--green)' : 'var(--red)' }}>{winLoss}</span>}
              </div>
            </section>
          )}

          {/* Deal summary */}
          <section className="prep-section">
            <h2 className="prep-section-title">Deal Summary</h2>
            <div className="prep-info-grid">
              <div className="prep-info-item"><span className="prep-info-label">Company</span><span className="prep-info-value">{account.company_name}</span></div>
              <div className="prep-info-item"><span className="prep-info-label">Industry</span><span className="prep-info-value">{account.industry || '—'}</span></div>
              <div className="prep-info-item"><span className="prep-info-label">Account Owner</span><span className="prep-info-value">{account.owner_name || '—'}</span></div>
              <div className="prep-info-item"><span className="prep-info-label">Final Stage</span><span className="prep-info-value">{account.deal_stage || '—'}</span></div>
              <div className="prep-info-item"><span className="prep-info-label">Deal Value</span><span className="prep-info-value">{fmt(account.deal_value)}</span></div>
              <div className="prep-info-item"><span className="prep-info-label">Close Date</span><span className="prep-info-value">{fmtDate(account.stage_exit_date || account.stage_entry_date)}</span></div>
              <div className="prep-info-item"><span className="prep-info-label">Total Days in Deal</span><span className="prep-info-value">{total_days != null ? `${total_days} days` : '—'}</span></div>
              <div className="prep-info-item"><span className="prep-info-label">Stages Traversed</span><span className="prep-info-value">{stageTimeline.length}</span></div>
              {winLoss && (
                <div className="prep-info-item prep-info-full">
                  <span className="prep-info-label">Win / Loss Reason</span>
                  <span className="prep-info-value">{winLoss}</span>
                </div>
              )}
            </div>
          </section>

          {/* Deal Timeline with SVG chart */}
          <section className="prep-section">
            <h2 className="prep-section-title">Deal Timeline</h2>
            {stageTimeline.length === 0 ? (
              <p className="muted">No stage history recorded.</p>
            ) : (
              <>
                <StageProgressionChart stageTimeline={stageTimeline} totalDays={total_days} />
                <div className="review-timeline" style={{ marginTop: '1rem' }}>
                  {stageTimeline.map((s, i) => (
                    <div key={s.id} className="review-timeline-row">
                      <div className="review-timeline-dot" style={{ background: STAGE_COLOR[s.to_stage] || 'var(--accent)' }} />
                      {i < stageTimeline.length - 1 && <div className="review-timeline-line" />}
                      <div className="review-timeline-content">
                        <div style={{ fontWeight: 700 }}>{s.to_stage}</div>
                        <div className="muted small">
                          Entered {fmtDateTime(s.entered_at)}
                          {s.exited_at && ` · Exited ${fmtDateTime(s.exited_at)}`}
                        </div>
                        <div style={{ marginTop: 2 }}>
                          <span className="badge" style={{ background: s.exited_at ? 'var(--green)' : 'var(--accent)', fontSize: 11 }}>
                            {s.days} day{s.days !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Sales Cycle Metrics */}
          {stageTimeline.length > 0 && (
            <section className="prep-section">
              <h2 className="prep-section-title">Sales Cycle Metrics</h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 10,
                fontFamily: 'system-ui, sans-serif',
              }}>
                {[
                  { label: 'Total Days in Deal', value: total_days != null ? `${total_days}d` : '—' },
                  { label: 'Stages Traversed', value: stageTimeline.length },
                  { label: 'Avg Days per Stage', value: avgDaysPerStage != null ? `${avgDaysPerStage}d` : '—' },
                  { label: 'Longest Stage', value: longestStage ? `${longestStage.to_stage} (${longestStage.days}d)` : '—' },
                  { label: 'Total Interactions', value: notes.length },
                  { label: 'Documents', value: documents.length },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '10px 14px',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{value}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Key Decision Makers */}
          <section className="prep-section">
            <h2 className="prep-section-title">Key Decision Makers</h2>
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

          {/* Win/Loss Analysis */}
          {isClosed && (
            <section className="prep-section">
              <h2 className="prep-section-title">Win / Loss Analysis</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'system-ui, sans-serif' }}>
                <div>
                  <div className="prep-info-label" style={{ marginBottom: 6 }}>Key Decision Maker(s)</div>
                  <input
                    value={analysis.key_decision_maker}
                    onChange={(e) => setAnalysis((a) => ({ ...a, key_decision_maker: e.target.value }))}
                    placeholder="Name and title of primary decision maker(s)…"
                    style={{ ...inputStyle, resize: 'none' }}
                  />
                </div>
                <div>
                  <div className="prep-info-label" style={{ marginBottom: 6 }}>Competitor Info (if applicable)</div>
                  <input
                    value={analysis.competitor}
                    onChange={(e) => setAnalysis((a) => ({ ...a, competitor: e.target.value }))}
                    placeholder="Competing vendor(s) or alternatives considered…"
                    style={{ ...inputStyle, resize: 'none' }}
                  />
                </div>
                <div>
                  <div className="prep-info-label" style={{ marginBottom: 6 }}>Budget Impact</div>
                  <input
                    value={analysis.budget_impact}
                    onChange={(e) => setAnalysis((a) => ({ ...a, budget_impact: e.target.value }))}
                    placeholder="Budget considerations, pricing adjustments, discount applied…"
                    style={{ ...inputStyle, resize: 'none' }}
                  />
                </div>
              </div>
            </section>
          )}

          {/* MEDDIC Analysis */}
          {(account.meddic_data || account.meddic_score > 0) && (() => {
            const md = account.meddic_data || {};
            const score = account.meddic_score || 0;
            const scoreColor = score >= 71 ? '#10b981' : score >= 41 ? '#f59e0b' : '#ef4444';
            const isWon = account.deal_stage === 'Closed-Won';
            const dims = [
              { key: 'metrics',           label: 'Metrics',           snippet: md.metrics?.business_impact },
              { key: 'economic_buyer',     label: 'Economic Buyer',    snippet: md.economic_buyer?.name },
              { key: 'decision_criteria',  label: 'Decision Criteria', snippet: md.decision_criteria?.business_criteria || md.decision_criteria?.technical_criteria },
              { key: 'decision_process',   label: 'Decision Process',  snippet: md.decision_process?.process_steps },
              { key: 'identify_pain',      label: 'Identify Pain',     snippet: md.identify_pain?.primary_pain },
              { key: 'champion',           label: 'Champion',          snippet: md.champion?.name },
            ];
            const gaps = dims.filter((d) => !d.snippet);
            return (
              <section className="prep-section">
                <h2 className="prep-section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  MEDDIC Analysis
                  <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor }}>{score}% at close</span>
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8, marginBottom: 12 }}>
                  {dims.map(({ key, label, snippet }) => {
                    const statusColor = snippet ? '#10b981' : '#ef4444';
                    return (
                      <div key={key} style={{
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        borderLeft: `3px solid ${statusColor}`, borderRadius: 6, padding: '8px 12px',
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                          {label}
                        </div>
                        {snippet
                          ? <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>{snippet.length > 80 ? snippet.slice(0, 80) + '…' : snippet}</div>
                          : <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Not captured</div>
                        }
                      </div>
                    );
                  })}
                </div>
                {!isWon && gaps.length > 0 && (
                  <div style={{
                    background: '#ef444411', border: '1px solid #ef444433', borderRadius: 6,
                    padding: '8px 12px', fontSize: 13, color: 'var(--text)',
                  }}>
                    <strong>MEDDIC gaps that may have contributed to loss:</strong>{' '}
                    {gaps.map((g) => g.label).join(', ')}
                  </div>
                )}
                {isWon && score >= 71 && (
                  <div style={{
                    background: '#10b98111', border: '1px solid #10b98133', borderRadius: 6,
                    padding: '8px 12px', fontSize: 13, color: 'var(--text)',
                  }}>
                    Strong MEDDIC coverage likely contributed to this win.
                  </div>
                )}
              </section>
            );
          })()}

          {/* Notes by stage */}
          <section className="prep-section">
            <h2 className="prep-section-title">Full Activity Log ({notes.length} entries, chronological)</h2>
            {notes.length === 0 ? (
              <p className="muted">No notes on record.</p>
            ) : (
              <div className="prep-notes">
                {notes.map((note) => (
                  <div key={note.id} className="prep-note-entry">
                    <div className="prep-note-date">{fmtDateTime(note.created_at)}</div>
                    <div className="prep-note-body" dangerouslySetInnerHTML={{ __html: note.content }} />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Documents */}
          {documents.length > 0 && (
            <section className="prep-section">
              <h2 className="prep-section-title">Documents ({documents.length})</h2>
              <div className="prep-docs-list">
                {documents.map((d) => (
                  <div key={d.id} className="prep-doc-row">
                    <span className="prep-doc-icon">📎</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{d.file_name}</div>
                      <div className="muted small">
                        {d.document_type || 'Document'} · {fmtDate(d.created_at)}
                        {d.deal_stage ? ` · Stage: ${d.deal_stage}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Learnings & Insights */}
          <section className="prep-section">
            <h2 className="prep-section-title">Learnings &amp; Insights</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: 'system-ui, sans-serif' }}>
              <div>
                <div className="prep-info-label" style={{ marginBottom: 6 }}>What Worked Well</div>
                {learnings.what_worked
                  ? <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{learnings.what_worked}</div>
                  : null}
                <textarea
                  className="no-print"
                  rows={3}
                  value={learnings.what_worked}
                  onChange={(e) => setLearnings((l) => ({ ...l, what_worked: e.target.value }))}
                  placeholder="Strategies, messaging, or interactions that drove the outcome…"
                  style={inputStyle}
                />
              </div>
              <div>
                <div className="prep-info-label" style={{ marginBottom: 6 }}>What Could Improve</div>
                {learnings.to_improve
                  ? <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{learnings.to_improve}</div>
                  : null}
                <textarea
                  className="no-print"
                  rows={3}
                  value={learnings.to_improve}
                  onChange={(e) => setLearnings((l) => ({ ...l, to_improve: e.target.value }))}
                  placeholder="Gaps, missteps, or areas to address in future similar deals…"
                  style={inputStyle}
                />
              </div>
              <div>
                <div className="prep-info-label" style={{ marginBottom: 6 }}>Next Steps for Similar Deals</div>
                {learnings.next_steps
                  ? <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{learnings.next_steps}</div>
                  : null}
                <textarea
                  className="no-print"
                  rows={3}
                  value={learnings.next_steps}
                  onChange={(e) => setLearnings((l) => ({ ...l, next_steps: e.target.value }))}
                  placeholder="Recommended approach for similar deals in the future…"
                  style={inputStyle}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
