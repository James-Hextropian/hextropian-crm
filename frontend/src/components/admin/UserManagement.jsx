import { useState, useEffect } from 'react';
import { useAuth, authFetch } from '../../context/AuthContext';

const ROLES = ['admin', 'sales_manager', 'sales_rep', 'viewer'];
const ROLE_COLORS = { admin: '#ef4444', sales_manager: '#f59e0b', sales_rep: '#6366f1', viewer: '#6b7280' };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

function UserForm({ user, reps, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'sales_rep',
    rep_id: user?.rep_id || '',
    is_active: user?.is_active !== false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (f) => (e) => setForm((v) => ({ ...v, [f]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, rep_id: form.rep_id || null };
      if (!user && !form.password) { setError('Password is required for new users'); return; }
      if (!form.password) delete payload.password;
      const result = user
        ? await authFetch(`/api/users/${user.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await authFetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      onSaved(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 480 }}>
        <h2>{user ? 'Edit User' : 'Add User'}</h2>
        {error && <p className="error">{error}</p>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
            Full Name *
            <input required value={form.name} onChange={set('name')} placeholder="Jane Smith" style={inputStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
            Email *
            <input required type="email" value={form.email} onChange={set('email')} placeholder="jane@company.com" style={inputStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
            {user ? 'New Password (leave blank to keep current)' : 'Password *'}
            <input type="password" value={form.password} onChange={set('password')} placeholder="Min 8 characters" style={inputStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
            Role *
            <select value={form.role} onChange={set('role')} style={inputStyle}>
              {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
          </label>
          {(form.role === 'sales_rep' || form.role === 'sales_manager') && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 500 }}>
              Linked Sales Rep
              <select value={form.rep_id} onChange={set('rep_id')} style={inputStyle}>
                <option value="">— None —</option>
                {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          )}
          {user && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((v) => ({ ...v, is_active: e.target.checked }))} />
              Account active
            </label>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : user ? 'Update' : 'Create User'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/users/activity/log?limit=50')
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Loading…</p>;
  if (!logs.length) return <p className="muted">No activity recorded.</p>;

  return (
    <div style={{ marginTop: '1rem' }}>
      <table className="dash-table">
        <thead>
          <tr><th>When</th><th>User</th><th>Action</th><th>Resource</th><th>IP</th></tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="muted small">{fmtDateTime(l.created_at)}</td>
              <td style={{ fontWeight: 500 }}>{l.user_name || '—'}</td>
              <td><span className="badge" style={{ background: 'var(--surface2)', color: 'var(--text)', fontSize: 11 }}>{l.action}</span></td>
              <td className="muted small">{l.resource_type ? `${l.resource_type}${l.resource_id ? ' #' + l.resource_id : ''}` : '—'}</td>
              <td className="muted small">{l.ip_address || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers]     = useState([]);
  const [reps, setReps]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | false | user
  const [tab, setTab]         = useState('users'); // 'users' | 'activity'
  const [error, setError]     = useState(null);

  const load = async () => {
    try {
      const [u, r] = await Promise.all([
        authFetch('/api/users'),
        authFetch('/api/reps'),
      ]);
      setUsers(u);
      setReps(r);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDeactivate = async (u) => {
    if (!confirm(`Deactivate ${u.name}? They will be logged out immediately.`)) return;
    try {
      await authFetch(`/api/users/${u.id}/deactivate`, { method: 'POST' });
      await load();
    } catch (err) { alert(err.message); }
  };

  const handleResetPw = async (u) => {
    const pw = prompt(`New password for ${u.name} (min 8 chars):`);
    if (!pw || pw.length < 8) return;
    try {
      await authFetch(`/api/users/${u.id}/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPassword: pw }),
      });
      alert('Password updated.');
    } catch (err) { alert(err.message); }
  };

  if (loading) return <p className="muted">Loading…</p>;
  if (error)   return <p className="error">{error}</p>;

  return (
    <div className="dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>User Management</h2>
        <button className="btn-primary" onClick={() => setEditing(false)}>+ Add User</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {['users', 'activity'].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
              color: tab === t ? 'var(--accent)' : 'var(--muted)', fontWeight: tab === t ? 600 : 400,
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              fontSize: 14, textTransform: 'capitalize',
            }}>
            {t === 'users' ? `Users (${users.length})` : 'Activity Log'}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <section className="dash-card">
          <table className="dash-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Rep</th><th>Last Login</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 600 }}>{u.name}{u.id === currentUser.id && <span className="muted small"> (you)</span>}</td>
                  <td className="muted">{u.email}</td>
                  <td>
                    <span className="badge" style={{ background: (ROLE_COLORS[u.role] || '#6b7280') + '22', color: ROLE_COLORS[u.role] || '#6b7280', fontSize: 11 }}>
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="muted">{u.rep_name || '—'}</td>
                  <td className="muted small">{fmtDate(u.last_login_at)}</td>
                  <td>
                    <span style={{ fontSize: 12, color: u.is_active ? 'var(--green)' : 'var(--red)' }}>
                      {u.is_active ? '● Active' : '○ Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-icon" onClick={() => setEditing(u)} title="Edit">✏️</button>
                      <button className="btn-icon" onClick={() => handleResetPw(u)} title="Reset password">🔑</button>
                      {u.id !== currentUser.id && u.is_active && (
                        <button className="btn-icon" onClick={() => handleDeactivate(u)} title="Deactivate">🚫</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'activity' && (
        <section className="dash-card">
          <h3>Recent Activity</h3>
          <ActivityLog />
        </section>
      )}

      {editing !== null && (
        <UserForm
          user={editing || null}
          reps={reps}
          onSaved={() => { setEditing(null); load(); }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
