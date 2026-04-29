import { useState } from 'react';
import { addContact, updateContact } from '../api';

export default function ContactForm({ customerId, contact, onSaved, onCancel }) {
  const [form, setForm] = useState({
    first_name: contact?.first_name || '',
    last_name:  contact?.last_name  || '',
    title:      contact?.title      || '',
    email:      contact?.email      || '',
    phone:      contact?.phone      || '',
    is_primary: contact?.is_primary || false,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = contact
        ? await updateContact(customerId, contact.id, form)
        : await addContact(customerId, form);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <h2>{contact ? 'Edit Contact' : 'Add Contact'}</h2>
        {error && <p className="error">{error}</p>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              First Name
              <input value={form.first_name} onChange={set('first_name')} placeholder="Jane" />
            </label>
            <label>
              Last Name
              <input value={form.last_name} onChange={set('last_name')} placeholder="Smith" />
            </label>
            <label>
              Title / Role
              <input value={form.title} onChange={set('title')} placeholder="VP of Engineering" />
            </label>
            <label>
              Phone
              <input type="tel" value={form.phone} onChange={set('phone')} placeholder="+1-555-000-0000" />
            </label>
            <label className="full-width">
              Email
              <input type="email" value={form.email} onChange={set('email')} placeholder="jane@company.com" />
            </label>
            <label className="full-width checkbox-label">
              <input type="checkbox" checked={form.is_primary} onChange={set('is_primary')} />
              Primary contact
            </label>
          </div>
          <div className="form-actions" style={{ marginTop: '1.5rem' }}>
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : contact ? 'Save Changes' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
