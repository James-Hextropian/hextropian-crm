import { useState, useEffect } from 'react';
import { createCustomer, updateCustomer, fetchReps } from '../api';

const INDUSTRIES = ['Oil & Gas', 'Financial Services', 'Life Sciences', 'Technology', 'Retail', 'Healthcare', 'Manufacturing', 'Other'];
export const STAGES = ['Prospecting', 'Qualification', 'Discovery', 'Demo', 'Negotiation', 'POC Planned', 'POC Active', 'Closed-Won', 'Closed-Lost', 'Post-Sale'];
const PROBS = [10, 25, 50, 75, 90, 100];

const EMPTY = {
  company_name: '', contact_person: '', email: '', phone: '',
  industry: '', deal_stage: 'Prospecting', deal_value: '',
  last_contact_date: '', notes: '',
  owner_id: '', expected_close_date: '', probability: '',
};

export default function CustomerForm({ customer, onSaved, onCancel }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [reps, setReps] = useState([]);

  useEffect(() => { fetchReps().then(setReps).catch(() => {}); }, []);

  useEffect(() => {
    if (customer) {
      setForm({
        ...customer,
        deal_value: customer.deal_value ?? '',
        last_contact_date: customer.last_contact_date ? customer.last_contact_date.slice(0, 10) : '',
        expected_close_date: customer.expected_close_date ? customer.expected_close_date.slice(0, 10) : '',
        owner_id: customer.owner_id ?? '',
        probability: customer.probability ?? '',
      });
    } else {
      setForm(EMPTY);
    }
  }, [customer]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        deal_value:   form.deal_value   === '' ? null : Number(form.deal_value),
        owner_id:     form.owner_id     === '' ? null : Number(form.owner_id),
        probability:  form.probability  === '' ? null : Number(form.probability),
        expected_close_date: form.expected_close_date || null,
        last_contact_date:   form.last_contact_date   || null,
      };
      const saved = customer
        ? await updateCustomer(customer.id, payload)
        : await createCustomer(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>{customer ? 'Edit Account' : 'Add Account'}</h2>
        {error && <p className="error">{error}</p>}
        <form onSubmit={submit} className="form-grid">
          <label>
            Company Name *
            <input required value={form.company_name} onChange={set('company_name')} />
          </label>
          <label>
            Contact Person
            <input value={form.contact_person} onChange={set('contact_person')} />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={set('email')} />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={set('phone')} />
          </label>
          <label>
            Industry
            <select value={form.industry} onChange={set('industry')}>
              <option value="">— Select —</option>
              {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
            </select>
          </label>
          <label>
            Deal Stage
            <select value={form.deal_stage} onChange={set('deal_stage')}>
              {STAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>
            Deal Value ($)
            <input type="number" min="0" step="1000" value={form.deal_value} onChange={set('deal_value')} />
          </label>
          <label>
            Expected Close Date
            <input type="date" value={form.expected_close_date} onChange={set('expected_close_date')} />
          </label>
          <label>
            Probability
            <select value={form.probability} onChange={set('probability')}>
              <option value="">— Select —</option>
              {PROBS.map((p) => <option key={p} value={p}>{p}%</option>)}
            </select>
          </label>
          <label>
            Account Owner
            <select value={form.owner_id} onChange={set('owner_id')}>
              <option value="">— Unassigned —</option>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label>
            Last Contact Date
            <input type="date" value={form.last_contact_date} onChange={set('last_contact_date')} />
          </label>
          <label className="full-width">
            Notes
            <textarea rows={4} value={form.notes} onChange={set('notes')} />
          </label>
          <div className="form-actions full-width">
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : customer ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
