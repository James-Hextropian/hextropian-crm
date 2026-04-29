import { useEffect, useState, useCallback } from 'react';
import { fetchTodayQueue, fillWorkqueue, advanceStage, markNoInterest } from '../api';

export const OUTREACH_STAGES = [
  { key: 'linkedin_view',    label: 'LinkedIn View',        icon: '👁️',  color: '#0077b5' },
  { key: 'linkedin_connect', label: 'LinkedIn Connect',     icon: '🔗',  color: '#0056a3' },
  { key: 'email_1',          label: 'Email',                icon: '📧',  color: '#10b981' },
  { key: 'phone',            label: 'Phone',                icon: '📞',  color: '#f59e0b' },
  { key: 'email_2',          label: 'Email (Follow-up)',    icon: '📧',  color: '#059669' },
  { key: 'linkedin_message', label: 'LinkedIn (Follow-up)', icon: '💬',  color: '#7c3aed' },
  { key: 'email_3',          label: 'Email (Final)',        icon: '📧',  color: '#047857' },
];

const STAGE_INDEX = Object.fromEntries(OUTREACH_STAGES.map((s, i) => [s.key, i]));
const NO_INTEREST_REASONS = [
  'Budget constraints', 'Not the right fit', 'Competitor / existing solution',
  'Not the right time', 'Wrong contact', 'No response', 'Other',
];

function StageProgress({ stage }) {
  const currentIdx = STAGE_INDEX[stage] ?? 0;
  return (
    <div className="wq-stage-progress">
      {OUTREACH_STAGES.map((s, i) => (
        <span
          key={s.key}
          className={
            i < currentIdx ? 'wq-stage-pip done' :
            i === currentIdx ? 'wq-stage-pip current' :
            'wq-stage-pip'
          }
          title={s.label}
        >
          {i < currentIdx ? '✓' : s.icon}
        </span>
      ))}
    </div>
  );
}

function StagePills({ queue, stageFilter, onSelect }) {
  const counts = Object.fromEntries(OUTREACH_STAGES.map((s) => [s.key, 0]));
  for (const e of queue) if (counts[e.outreach_stage] !== undefined) counts[e.outreach_stage]++;

  return (
    <div className="wq-stage-filters">
      <button
        className={`wq-stage-pill${stageFilter === null ? ' active' : ''}`}
        style={stageFilter === null ? { background: '#4b5563', borderColor: '#4b5563', color: '#fff' } : {}}
        onClick={() => onSelect(null)}
      >
        All
        <span className="wq-stage-pill-count">{queue.length}</span>
      </button>
      {OUTREACH_STAGES.map((s) => {
        const count    = counts[s.key];
        const isActive = stageFilter === s.key;
        return (
          <button
            key={s.key}
            className={`wq-stage-pill${isActive ? ' active' : ''}`}
            style={{
              ...(isActive
                ? { background: s.color, borderColor: s.color, color: '#fff' }
                : { borderColor: count > 0 ? s.color + '66' : undefined, color: count > 0 ? s.color : undefined }),
              opacity: count === 0 ? 0.4 : 1,
            }}
            onClick={() => onSelect(isActive ? null : s.key)}
            title={count === 0 ? 'No prospects at this stage' : undefined}
          >
            {s.icon} {s.label}
            <span className="wq-stage-pill-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function WorkQueue({ currentRepId, onOpenProspect, refreshKey }) {
  const [queue, setQueue]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [filling, setFilling]           = useState(false);
  const [fillMsg, setFillMsg]           = useState(null);
  const [stageFilter, setStageFilter]   = useState(null);
  const [selected, setSelected]         = useState(new Set());
  const [advancingIds, setAdvancingIds] = useState(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [showNIModal, setShowNIModal]   = useState(false);
  const [niReason, setNiReason]         = useState('');

  const load = useCallback(async () => {
    if (!currentRepId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTodayQueue(currentRepId);
      setQueue(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [currentRepId]);

  useEffect(() => { load(); }, [load]);

  // Reload when ProspectCard advances a prospect (refreshKey bumped by parent)
  useEffect(() => {
    if (refreshKey > 0) load();
  }, [refreshKey, load]);

  // Clear selection when switching stage filter
  useEffect(() => { setSelected(new Set()); }, [stageFilter]);

  const handleFill = async () => {
    if (!currentRepId) return;
    setFilling(true);
    setFillMsg(null);
    try {
      const result = await fillWorkqueue(currentRepId);
      setFillMsg(result.added > 0
        ? `Added ${result.added} prospect${result.added !== 1 ? 's' : ''} to your queue.`
        : result.message || 'No new prospects to add.');
      await load();
    } catch (e) {
      setFillMsg(`Error: ${e.message}`);
    } finally {
      setFilling(false);
      setTimeout(() => setFillMsg(null), 4000);
    }
  };

  // Single inline advance (↑ button in row — no note, no modal)
  const handleInlineAdvance = async (entry, e) => {
    e.stopPropagation();
    if (advancingIds.has(entry.wq_id)) return;
    if (STAGE_INDEX[entry.outreach_stage] >= OUTREACH_STAGES.length - 1) return;
    setAdvancingIds((prev) => new Set(prev).add(entry.wq_id));
    try {
      const updated = await advanceStage(entry.contact_id, currentRepId, null);
      setQueue((prev) => prev.map((q) =>
        q.wq_id === entry.wq_id ? { ...q, outreach_stage: updated.outreach_stage, days_in_stage: 0 } : q
      ));
    } catch (err) {
      alert(err.message);
    } finally {
      setAdvancingIds((prev) => { const next = new Set(prev); next.delete(entry.wq_id); return next; });
    }
  };

  // Batch advance all selected (runs in parallel, updates queue in-place)
  const handleBatchAdvance = async () => {
    if (batchRunning || selected.size === 0) return;
    setBatchRunning(true);
    const targets = visibleQueue.filter((e) => selected.has(e.wq_id));
    const results = await Promise.allSettled(
      targets.map((entry) => {
        if (STAGE_INDEX[entry.outreach_stage] >= OUTREACH_STAGES.length - 1) return Promise.resolve(null);
        return advanceStage(entry.contact_id, currentRepId, null)
          .then((updated) => ({ wq_id: entry.wq_id, outreach_stage: updated.outreach_stage }));
      })
    );
    setQueue((prev) => {
      let next = [...prev];
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          const { wq_id, outreach_stage } = r.value;
          next = next.map((q) => q.wq_id === wq_id ? { ...q, outreach_stage, days_in_stage: 0 } : q);
        }
      }
      return next;
    });
    setSelected(new Set());
    setBatchRunning(false);
  };

  // Batch no-interest: removes entries from queue on success
  const handleBatchNoInterest = async () => {
    if (!niReason || batchRunning) return;
    setBatchRunning(true);
    const targets = visibleQueue.filter((e) => selected.has(e.wq_id));
    await Promise.allSettled(
      targets.map((entry) => markNoInterest(entry.contact_id, niReason, currentRepId))
    );
    setQueue((prev) => prev.filter((q) => !selected.has(q.wq_id)));
    setSelected(new Set());
    setShowNIModal(false);
    setNiReason('');
    setBatchRunning(false);
  };

  const activeCount = queue.length;
  const canFill     = activeCount < 50;

  // When filtered, sort by days_in_stage descending (longest-waiting first)
  const visibleQueue = (() => {
    const filtered = stageFilter ? queue.filter((e) => e.outreach_stage === stageFilter) : queue;
    return stageFilter ? [...filtered].sort((a, b) => b.days_in_stage - a.days_in_stage) : filtered;
  })();

  const activeStage        = stageFilter ? OUTREACH_STAGES.find((s) => s.key === stageFilter) : null;
  const stageLabel         = (key) => OUTREACH_STAGES.find((s) => s.key === key)?.label ?? key;
  const allVisibleSelected = visibleQueue.length > 0 && visibleQueue.every((e) => selected.has(e.wq_id));
  const someSelected       = selected.size > 0;

  const toggleAll = () => setSelected(
    allVisibleSelected ? new Set() : new Set(visibleQueue.map((e) => e.wq_id))
  );
  const toggleOne = (wq_id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(wq_id)) next.delete(wq_id); else next.add(wq_id);
    return next;
  });

  if (!currentRepId) return <p className="muted">Select a rep to view your workqueue.</p>;

  return (
    <div>
      <div className="toolbar">
        <div>
          <span style={{ fontSize: 18, fontWeight: 700 }}>
            {activeStage ? `${activeStage.icon} ${activeStage.label}` : "Today's Workqueue"}
          </span>
          <span className="muted" style={{ fontSize: 13, marginLeft: 12 }}>
            {stageFilter
              ? `${visibleQueue.length} prospect${visibleQueue.length !== 1 ? 's' : ''}`
              : `${activeCount}/50 active prospects`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          {fillMsg && <span className="muted" style={{ fontSize: 13 }}>{fillMsg}</span>}
          {!stageFilter && canFill && (
            <button className="btn-primary" onClick={handleFill} disabled={filling}>
              {filling ? 'Filling…' : `+ Fill Queue (${50 - activeCount} slots)`}
            </button>
          )}
          <button className="btn-secondary" onClick={load} disabled={loading}>↻ Refresh</button>
        </div>
      </div>

      {queue.length > 0 && (
        <StagePills queue={queue} stageFilter={stageFilter} onSelect={setStageFilter} />
      )}

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : queue.length === 0 ? (
        <div className="pe-empty-state">
          <div className="pe-empty-icon">📋</div>
          <h3>Your workqueue is empty</h3>
          <p>Click "Fill Queue" to load up to 50 prospects from your contacts database.</p>
          <button className="btn-primary" onClick={handleFill} disabled={filling || !currentRepId}>
            {filling ? 'Filling…' : 'Fill Queue Now'}
          </button>
        </div>
      ) : visibleQueue.length === 0 ? (
        <div className="pe-empty-state" style={{ padding: '2rem' }}>
          <div className="pe-empty-icon" style={{ fontSize: 32 }}>{activeStage?.icon}</div>
          <h3>No prospects at this stage</h3>
          <p>No one in your queue is currently at the {activeStage?.label} stage.</p>
          <button className="btn-secondary" onClick={() => setStageFilter(null)}>← Show All</button>
        </div>
      ) : (
        <>
          {someSelected && (
            <div className="wq-batch-bar">
              <span className="wq-batch-count">{selected.size} selected</span>
              <button
                className="btn-primary"
                style={{ fontSize: 13, padding: '5px 14px' }}
                onClick={handleBatchAdvance}
                disabled={batchRunning}
              >
                {batchRunning ? 'Working…' : `↑ Advance Stage (${selected.size})`}
              </button>
              <button
                className="btn-secondary"
                style={{ fontSize: 13, padding: '5px 14px', color: 'var(--red)', borderColor: 'var(--red)' }}
                onClick={() => setShowNIModal(true)}
                disabled={batchRunning}
              >
                ✕ No Interest ({selected.size})
              </button>
              <button
                style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '5px 8px' }}
                onClick={() => setSelected(new Set())}
              >
                Clear
              </button>
            </div>
          )}

          <div className="table-wrap">
            <table className="customer-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                      style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                    />
                  </th>
                  <th>Contact</th>
                  <th>Company / Title</th>
                  <th>Vertical</th>
                  {!stageFilter && <th>Stage</th>}
                  <th>Progress</th>
                  <th title="Days in current stage">{stageFilter ? '↓ Days' : 'Days'}</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleQueue.map((entry) => {
                  const stage    = OUTREACH_STAGES.find((s) => s.key === entry.outreach_stage);
                  const isLast   = STAGE_INDEX[entry.outreach_stage] >= OUTREACH_STAGES.length - 1;
                  const inFlight = advancingIds.has(entry.wq_id);
                  const isChecked = selected.has(entry.wq_id);
                  return (
                    <tr
                      key={entry.wq_id}
                      className={`customer-row${isChecked ? ' wq-row-selected' : ''}`}
                      onClick={() => onOpenProspect(entry)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOne(entry.wq_id)}
                          style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                        />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className="company-link" onClick={() => onOpenProspect(entry)}>
                          {entry.first_name} {entry.last_name}
                        </button>
                        {entry.email && <div className="muted small">{entry.email}</div>}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{entry.company || '—'}</div>
                        {entry.title && <div className="muted small">{entry.title}</div>}
                      </td>
                      <td>{entry.vertical || '—'}</td>
                      {!stageFilter && (
                        <td>
                          <span className="pe-stage-badge" style={{ color: stage?.color, fontWeight: 600 }}>
                            {stage?.icon} {stageLabel(entry.outreach_stage)}
                          </span>
                        </td>
                      )}
                      <td onClick={(e) => e.stopPropagation()}>
                        <StageProgress stage={entry.outreach_stage} />
                      </td>
                      <td>
                        <span className={entry.days_in_stage > 5 ? 'pe-days-warn' : 'muted'}>
                          {entry.days_in_stage}d
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn-icon"
                            onClick={(e) => handleInlineAdvance(entry, e)}
                            disabled={inFlight || isLast}
                            title={isLast ? 'Sequence complete' : 'Advance to next stage'}
                            style={{ opacity: isLast ? 0.3 : 1 }}
                          >
                            {inFlight ? '…' : '↑'}
                          </button>
                          <button className="btn-icon" onClick={() => onOpenProspect(entry)} title="Open details">👁️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showNIModal && (
        <div className="modal-overlay" style={{ zIndex: 200 }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h3 style={{ marginBottom: '1rem' }}>Mark {selected.size} Prospect{selected.size !== 1 ? 's' : ''} as No Interest</h3>
            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Reason (applies to all)</span>
              <select value={niReason} onChange={(e) => setNiReason(e.target.value)}>
                <option value="">— Select reason —</option>
                {NO_INTEREST_REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => { setShowNIModal(false); setNiReason(''); }}>Cancel</button>
              <button
                className="btn-primary"
                style={{ background: 'var(--red)' }}
                onClick={handleBatchNoInterest}
                disabled={!niReason || batchRunning}
              >
                {batchRunning ? 'Processing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
