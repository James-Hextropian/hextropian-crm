import { useState, useCallback } from 'react';
import { authFetch } from '../../context/AuthContext';
import MeddicScoreRing from './MeddicScoreRing';

const EMPTY_DATA = {
  metrics:           { business_impact: '', roi_estimate: '', success_metrics: '' },
  economic_buyer:    { name: '', title: '', contacted: false, accessible: false },
  decision_criteria: { technical_criteria: '', business_criteria: '', formal_rfp: false },
  decision_process:  { process_steps: '', timeline: '', next_formal_step: '', stakeholders: '' },
  identify_pain:     { primary_pain: '', pain_impact: '', urgency_reason: '', pain_priority: '' },
  champion:          { name: '', title: '', engaged: false, access_power: false, selling_internally: false },
};

function calcScore(data) {
  const m  = data.metrics           || {};
  const eb = data.economic_buyer    || {};
  const dc = data.decision_criteria || {};
  const dp = data.decision_process  || {};
  const ip = data.identify_pain     || {};
  const c  = data.champion          || {};
  const scores = [
    !m.business_impact ? 0 : (m.roi_estimate && m.success_metrics ? 2 : 1),
    !eb.name           ? 0 : (eb.contacted && eb.accessible       ? 2 : 1),
    (!dc.technical_criteria && !dc.business_criteria) ? 0 : (dc.technical_criteria && dc.business_criteria ? 2 : 1),
    !dp.process_steps  ? 0 : (dp.timeline && dp.next_formal_step  ? 2 : 1),
    !ip.primary_pain   ? 0 : (ip.pain_impact && ip.urgency_reason ? 2 : 1),
    !c.name            ? 0 : (c.engaged && c.access_power         ? 2 : 1),
  ];
  return Math.round(scores.reduce((a, b) => a + b, 0) / 12 * 100);
}

function dimStatus(data, dim) {
  const d = data?.[dim] || {};
  let score;
  switch (dim) {
    case 'metrics':
      score = !d.business_impact ? 0 : (d.roi_estimate && d.success_metrics ? 2 : 1); break;
    case 'economic_buyer':
      score = !d.name ? 0 : (d.contacted && d.accessible ? 2 : 1); break;
    case 'decision_criteria':
      score = (!d.technical_criteria && !d.business_criteria) ? 0 : (d.technical_criteria && d.business_criteria ? 2 : 1); break;
    case 'decision_process':
      score = !d.process_steps ? 0 : (d.timeline && d.next_formal_step ? 2 : 1); break;
    case 'identify_pain':
      score = !d.primary_pain ? 0 : (d.pain_impact && d.urgency_reason ? 2 : 1); break;
    case 'champion':
      score = !d.name ? 0 : (d.engaged && d.access_power ? 2 : 1); break;
    default: score = 0;
  }
  return score === 2 ? 'complete' : score === 1 ? 'partial' : 'missing';
}

const STATUS_STYLE = {
  complete: { background: '#10b98122', color: '#10b981', border: '1px solid #10b98144' },
  partial:  { background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44' },
  missing:  { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' },
};

function Chip({ status }) {
  return (
    <span style={{
      ...STATUS_STYLE[status],
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      textTransform: 'capitalize', display: 'inline-block',
    }}>
      {status}
    </span>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{label}</span>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        style={{
          fontSize: 13, padding: '6px 8px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)',
          resize: 'vertical', fontFamily: 'inherit',
        }}
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} />
      {label}
    </label>
  );
}

const DIMS = [
  {
    key: 'metrics', label: 'Metrics',
    hint: 'Quantified business impact and ROI',
    fields: [
      { k: 'business_impact', label: 'Business Impact', placeholder: 'What business problem does this solve? What is the impact?' },
      { k: 'roi_estimate',    label: 'ROI Estimate',    placeholder: 'Expected ROI or cost savings...' },
      { k: 'success_metrics', label: 'Success Metrics', placeholder: 'How will success be measured?' },
    ],
    toggles: [],
  },
  {
    key: 'economic_buyer', label: 'Economic Buyer',
    hint: 'Person with final budget authority',
    fields: [
      { k: 'name',  label: 'Name',  placeholder: 'Economic buyer name...' },
      { k: 'title', label: 'Title', placeholder: 'Title / role...' },
    ],
    toggles: [
      { k: 'contacted',  label: 'Contacted' },
      { k: 'accessible', label: 'Accessible to us' },
    ],
  },
  {
    key: 'decision_criteria', label: 'Decision Criteria',
    hint: 'Technical and business requirements for the decision',
    fields: [
      { k: 'technical_criteria', label: 'Technical Criteria', placeholder: 'Technical requirements...' },
      { k: 'business_criteria',  label: 'Business Criteria',  placeholder: 'Business requirements...' },
    ],
    toggles: [{ k: 'formal_rfp', label: 'Formal RFP / vendor evaluation underway' }],
  },
  {
    key: 'decision_process', label: 'Decision Process',
    hint: 'How they buy and who is involved',
    fields: [
      { k: 'process_steps',    label: 'Process Steps',     placeholder: 'Describe the decision-making process...' },
      { k: 'timeline',         label: 'Timeline',          placeholder: 'Expected decision timeline...' },
      { k: 'next_formal_step', label: 'Next Formal Step',  placeholder: 'What is the next formal step?' },
      { k: 'stakeholders',     label: 'Stakeholders',      placeholder: 'Key stakeholders involved...' },
    ],
    toggles: [],
  },
  {
    key: 'identify_pain', label: 'Identify Pain',
    hint: 'Understood pain points and urgency',
    fields: [
      { k: 'primary_pain',   label: 'Primary Pain',   placeholder: 'Core problem they are trying to solve...' },
      { k: 'pain_impact',    label: 'Pain Impact',    placeholder: 'Business impact of the pain...' },
      { k: 'urgency_reason', label: 'Urgency Reason', placeholder: 'Why must this be solved now?' },
      { k: 'pain_priority',  label: 'Pain Priority',  placeholder: 'How high a priority is this for them?' },
    ],
    toggles: [],
  },
  {
    key: 'champion', label: 'Champion',
    hint: 'Internal advocate who sells on your behalf',
    fields: [
      { k: 'name',  label: 'Name',  placeholder: 'Champion name...' },
      { k: 'title', label: 'Title', placeholder: 'Title / role...' },
    ],
    toggles: [
      { k: 'engaged',           label: 'Actively engaged' },
      { k: 'access_power',      label: 'Has access to power' },
      { k: 'selling_internally', label: 'Selling internally for us' },
    ],
  },
];

export default function MeddicPanel({ customerId, initialData = {}, initialScore = 0, onScoreChange }) {
  const [data,    setData]    = useState(() => ({ ...EMPTY_DATA, ...initialData }));
  const [score,   setScore]   = useState(initialScore);
  const [open,    setOpen]    = useState({});
  const [saving,  setSaving]  = useState(false);
  const [saveOk,  setSaveOk]  = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  const updateField = useCallback((dim, field, value) => {
    setData((prev) => {
      const next = { ...prev, [dim]: { ...prev[dim], [field]: value } };
      setScore(calcScore(next));
      return next;
    });
    setSaveOk(false);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveErr(null);
    setSaveOk(false);
    try {
      const res = await authFetch(`/api/meddic/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meddic_data: data }),
      });
      setScore(res.meddic_score);
      onScoreChange?.(res.meddic_score, data);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (e) {
      setSaveErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const scoreColor = score >= 71 ? '#10b981' : score >= 41 ? '#f59e0b' : '#ef4444';

  return (
    <div className="detail-section">
      <div className="section-header">
        <h2 className="section-title">MEDDIC Qualification</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: scoreColor, fontWeight: 700 }}>{score}% qualified</span>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: 13 }}>
            {saving ? 'Saving…' : 'Save MEDDIC'}
          </button>
          {saveOk  && <span style={{ color: '#10b981', fontSize: 13 }}>✓ Saved</span>}
          {saveErr && <span style={{ color: '#ef4444', fontSize: 13 }}>{saveErr}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <MeddicScoreRing score={score} data={data} size={110} />

        <div style={{ flex: 1, minWidth: 280 }}>
          {DIMS.map((dim) => {
            const status  = dimStatus(data, dim.key);
            const isOpen  = !!open[dim.key];
            const dimData = data[dim.key] || {};

            return (
              <div key={dim.key} style={{ marginBottom: 6, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, [dim.key]: !o[dim.key] }))}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', background: 'var(--surface2)', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>
                    {dim.label}
                  </span>
                  <Chip status={status} />
                  <span style={{ color: 'var(--muted)', fontSize: 14 }}>{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div style={{ padding: '12px 14px', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{dim.hint}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {dim.fields.map((f) => (
                        <Field
                          key={f.k}
                          label={f.label}
                          placeholder={f.placeholder}
                          value={dimData[f.k]}
                          onChange={(v) => updateField(dim.key, f.k, v)}
                        />
                      ))}
                    </div>
                    {dim.toggles.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, paddingTop: 4 }}>
                        {dim.toggles.map((t) => (
                          <Toggle
                            key={t.k}
                            label={t.label}
                            checked={dimData[t.k]}
                            onChange={(v) => updateField(dim.key, t.k, v)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
