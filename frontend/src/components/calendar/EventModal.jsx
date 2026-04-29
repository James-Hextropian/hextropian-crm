import { useState, useEffect } from 'react';
import { authFetch } from '../../context/AuthContext';

const REMINDERS = [
  { label: '10 minutes', minutes: 10 },
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '1 day', minutes: 1440 },
];

function toLocalDateTimeInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EventModal({ event, initialDate, onSaved, onDeleted, onClose }) {
  const isNew = !event;
  const startDefault = initialDate ? toLocalDateTimeInput(initialDate) : toLocalDateTimeInput(new Date(Math.ceil(Date.now() / 1800000) * 1800000));
  const endDefault   = initialDate ? toLocalDateTimeInput(new Date(new Date(initialDate).getTime() + 3600000)) : toLocalDateTimeInput(new Date(Math.ceil(Date.now() / 1800000) * 1800000 + 3600000));

  const [form, setForm] = useState({
    title: event?.title || '',
    description: event?.description || '',
    start_time: event ? toLocalDateTimeInput(event.start_time) : startDefault,
    end_time:   event ? toLocalDateTimeInput(event.end_time)   : endDefault,
    location: event?.location || '',
    customer_id: event?.customer_id || '',
    reminder_minutes: (event?.reminders?.[0]?.minutes) || 15,
    add_to_notes: false,
  });
  const [accounts, setAccounts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [attendeeEmail, setAttendeeEmail] = useState('');
  const [attendees, setAttendees] = useState(event?.attendees || []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    authFetch('/api/customers').then(setAccounts).catch(() => {});
  }, []);

  useEffect(() => {
    if (form.customer_id) {
      authFetch(`/api/customers/${form.customer_id}/contacts`)
        .then(setContacts)
        .catch(() => setContacts([]));
    } else {
      setContacts([]);
    }
  }, [form.customer_id]);

  const set = (f) => (e) => setForm((v) => ({ ...v, [f]: e.target.value }));

  const addAttendee = () => {
    if (!attendeeEmail.trim()) return;
    setAttendees((a) => [...a, { name: '', email: attendeeEmail.trim() }]);
    setAttendeeEmail('');
  };

  const addContactAsAttendee = (c) => {
    if (!c.email) return;
    if (attendees.find((a) => a.email === c.email)) return;
    setAttendees((a) => [...a, { name: [c.first_name, c.last_name].filter(Boolean).join(' '), email: c.email }]);
  };

  const removeAttendee = (idx) => setAttendees((a) => a.filter((_, i) => i !== idx));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        customer_id: form.customer_id || null,
        start_time: new Date(form.start_time).toISOString(),
        end_time:   new Date(form.end_time).toISOString(),
        attendees,
        reminders: [{ minutes: Number(form.reminder_minutes) }],
      };
      const result = event
        ? await authFetch(`/api/calendar/events/${event.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await authFetch('/api/calendar/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      onSaved(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this event? This will also remove it from Google Calendar.')) return;
    setDeleting(true);
    try {
      await authFetch(`/api/calendar/events/${event.id}`, { method: 'DELETE' });
      onDeleted?.(event.id);
    } catch (err) { alert(err.message); }
    finally { setDeleting(false); }
  };

  const inputStyle = { padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13, width: '100%' };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }}>
        <h2>{isNew ? 'Schedule Meeting' : 'Edit Event'}</h2>
        {error && <p className="error">{error}</p>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
            Title *
            <input required value={form.title} onChange={set('title')} placeholder="Meeting with Acme Corp" style={inputStyle} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
              Start *
              <input required type="datetime-local" value={form.start_time} onChange={set('start_time')} style={inputStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
              End *
              <input required type="datetime-local" value={form.end_time} onChange={set('end_time')} style={inputStyle} />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
            Location
            <input value={form.location} onChange={set('location')} placeholder="Zoom / Office / Phone" style={inputStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
            Linked Account
            <select value={form.customer_id} onChange={set('customer_id')} style={inputStyle}>
              <option value="">— None —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.company_name}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
            Description
            <textarea rows={3} value={form.description} onChange={set('description')} placeholder="Agenda, talking points…" style={{ ...inputStyle, resize: 'vertical' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
            Reminder
            <select value={form.reminder_minutes} onChange={set('reminder_minutes')} style={inputStyle}>
              {REMINDERS.map((r) => <option key={r.minutes} value={r.minutes}>{r.label} before</option>)}
            </select>
          </label>

          {/* Attendees */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Attendees</div>
            {contacts.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {contacts.filter((c) => c.email).map((c) => (
                  <button key={c.id} type="button" onClick={() => addContactAsAttendee(c)}
                    className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}>
                    + {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input type="email" value={attendeeEmail} onChange={(e) => setAttendeeEmail(e.target.value)}
                placeholder="Add email address" style={{ ...inputStyle, flex: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAttendee())} />
              <button type="button" className="btn-secondary" onClick={addAttendee} style={{ fontSize: 13, whiteSpace: 'nowrap' }}>+ Add</button>
            </div>
            {attendees.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                <span style={{ flex: 1, color: 'var(--muted)' }}>{a.name ? `${a.name} <${a.email}>` : a.email}</span>
                <button type="button" className="btn-icon" onClick={() => removeAttendee(i)}>✕</button>
              </div>
            ))}
          </div>

          {isNew && form.customer_id && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.add_to_notes} onChange={(e) => setForm((v) => ({ ...v, add_to_notes: e.target.checked }))} />
              Add to account notes
            </label>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : isNew ? 'Create Event' : 'Save Changes'}</button>
            </div>
            {!isNew && (
              <button type="button" onClick={handleDelete} disabled={deleting}
                style={{ background: 'none', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
