import { useEffect, useState } from 'react';
import { fetchGmailStatus, disconnectGmail } from '../api';

export default function GmailStatus() {
  const [status, setStatus] = useState(null);

  const load = () => fetchGmailStatus().then(setStatus).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!status) return null;

  if (!status.connected) {
    return (
      <a
        href="http://localhost:3001/api/auth/google"
        target="_blank"
        rel="noreferrer"
        className="gmail-btn gmail-btn--connect"
        onClick={() => setTimeout(load, 3000)}
      >
        Connect Gmail
      </a>
    );
  }

  return (
    <div className="gmail-status">
      <span className="gmail-dot" />
      <span className="gmail-email">{status.email}</span>
      <button
        className="gmail-disconnect"
        onClick={() => disconnectGmail().then(load)}
        title="Disconnect Gmail"
      >
        ×
      </button>
    </div>
  );
}
