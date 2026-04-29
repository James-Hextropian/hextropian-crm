import { useState, useEffect } from 'react';
import { sendEmail, fetchEmailHistory } from '../api';

const fmtDate = (d) => new Date(d).toLocaleString('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

export default function EmailModal({ customer, onClose, onSent }) {
  const [form, setForm] = useState({
    to: customer.email || '',
    subject: `Following up — ${customer.company_name}`,
    body: '',
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (customer.id) {
      fetchEmailHistory(customer.id).then(setHistory).catch(() => {});
    }
  }, [customer.id]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await sendEmail({ ...form, customer_id: customer.id });
      onSent?.();
      onClose();
    } catch (err) {
      setError(err.message.includes('not connected')
        ? 'Gmail not connected. Click "Connect Gmail" in the header first.'
        : err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal email-modal">
        <div className="email-modal-header">
          <div>
            <h2>Email {customer.company_name}</h2>
            {customer.contact_person && (
              <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                Attn: {customer.contact_person}
              </p>
            )}
          </div>
          <button className="btn-icon" onClick={onClose} style={{ fontSize: 18, opacity: 0.6 }}>×</button>
        </div>

        {error && <p className="error">{error}</p>}

        <form onSubmit={submit} className="email-form">
          <label>
            To
            <input
              type="email"
              required
              value={form.to}
              onChange={set('to')}
              placeholder="recipient@company.com"
            />
          </label>
          <label>
            Subject
            <input
              required
              value={form.subject}
              onChange={set('subject')}
            />
          </label>
          <label>
            Message
            <textarea
              required
              rows={10}
              value={form.body}
              onChange={set('body')}
              placeholder={`Hi ${customer.contact_person?.split(' ')[0] || 'there'},\n\n`}
            />
          </label>
          <div className="form-actions">
            {history.length > 0 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowHistory((v) => !v)}
              >
                {showHistory ? 'Hide' : 'Show'} history ({history.length})
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={sending}>
              {sending ? 'Sending…' : 'Send via Gmail'}
            </button>
          </div>
        </form>

        {showHistory && history.length > 0 && (
          <div className="email-history">
            <h4>Email history</h4>
            {history.map((log) => (
              <div key={log.id} className="email-history-item">
                <div className="email-history-meta">
                  <span className="email-history-subject">{log.subject}</span>
                  <span className="muted small">{fmtDate(log.sent_at)}</span>
                </div>
                <p className="email-history-body">{log.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
