import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const ROLE_LABELS = {
  admin:         { label: 'Admin',         color: '#ef4444' },
  sales_manager: { label: 'Sales Manager', color: '#f59e0b' },
  sales_rep:     { label: 'Sales Rep',     color: '#6366f1' },
  viewer:        { label: 'Viewer',        color: '#6b7280' },
};

export default function UserMenu({ onConnectGoogle, googleConnected }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!user) return null;

  const role = ROLE_LABELS[user.role] || { label: user.role, color: '#6b7280' };
  const initials = user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--text)',
          transition: 'border-color 0.15s',
        }}
      >
        <span style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'var(--accent)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
        }}>
          {initials}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.name}
        </span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 6,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          zIndex: 200, minWidth: 220, overflow: 'hidden',
        }}>
          {/* User info */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{user.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{user.email}</div>
            <span style={{
              display: 'inline-block', marginTop: 6,
              padding: '2px 8px', borderRadius: 4,
              background: role.color + '22', color: role.color,
              fontSize: 11, fontWeight: 600,
            }}>
              {role.label}
            </span>
          </div>

          {/* Google Calendar status */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            {googleConnected ? (
              <span style={{ color: 'var(--green)' }}>✓ Google Calendar connected</span>
            ) : (
              <button
                onClick={() => { setOpen(false); onConnectGoogle?.(); }}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, padding: 0 }}
              >
                Connect Google Calendar →
              </button>
            )}
          </div>

          {/* Actions */}
          <div style={{ padding: '6px 8px' }}>
            <MenuItem onClick={() => { setOpen(false); logout(); }}>Sign Out</MenuItem>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '8px 10px', border: 'none', background: 'none',
        color: danger ? '#ef4444' : 'var(--text)', cursor: 'pointer',
        fontSize: 13, borderRadius: 6,
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface2)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
    >
      {children}
    </button>
  );
}
