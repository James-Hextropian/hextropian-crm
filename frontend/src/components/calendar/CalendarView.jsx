import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../context/AuthContext';
import WeeklyView from './WeeklyView';
import MonthlyView from './MonthlyView';
import EventModal from './EventModal';

function headerLabel(mode, anchor) {
  if (mode === 'week') {
    const start = new Date(anchor);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    if (start.getMonth() === end.getMonth()) {
      return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function CalendarView() {
  const [mode, setMode] = useState('week');
  const [anchor, setAnchor] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      let start, end;
      if (mode === 'week') {
        start = new Date(anchor);
        start.setDate(start.getDate() - start.getDay());
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(end.getDate() + 7);
      } else {
        start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
      }
      const data = await authFetch(`/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`);
      setEvents(data);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [mode, anchor]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  useEffect(() => {
    authFetch('/api/calendar/status').then((s) => setGoogleConnected(s.connected)).catch(() => {});
  }, []);

  const navigate = (dir) => {
    setAnchor((prev) => {
      const d = new Date(prev);
      if (mode === 'week') d.setDate(d.getDate() + dir * 7);
      else d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await authFetch('/api/calendar/sync', { method: 'POST' });
      await loadEvents();
    } catch (err) { alert(err.message); }
    finally { setSyncing(false); }
  };

  const handleSaved = () => { setModal(null); loadEvents(); };
  const handleDeleted = () => { setModal(null); loadEvents(); };

  return (
    <div className="dashboard">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Calendar</h2>

        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => navigate(-1)}>‹</button>
          <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setAnchor(new Date())}>Today</button>
          <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => navigate(1)}>›</button>
        </div>

        <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{headerLabel(mode, anchor)}</span>

        <div style={{ display: 'flex', gap: 4 }}>
          {['week', 'month'].map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={mode === m ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: 13, padding: '6px 14px', textTransform: 'capitalize' }}>
              {m}
            </button>
          ))}
        </div>

        {googleConnected && (
          <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={handleSync} disabled={syncing}>
            {syncing ? 'Syncing…' : '↻ Sync Google'}
          </button>
        )}

        <button className="btn-primary" onClick={() => { const d = new Date(); d.setMinutes(0, 0, 0); setModal({ initialDate: d }); }}>
          + Event
        </button>
      </div>

      {loading && <p className="muted" style={{ textAlign: 'center', padding: '3rem' }}>Loading…</p>}

      {!loading && mode === 'week' && (
        <WeeklyView
          anchor={anchor}
          events={events}
          onSlotClick={(date) => setModal({ initialDate: date })}
          onEventClick={(event) => setModal({ event })}
        />
      )}

      {!loading && mode === 'month' && (
        <MonthlyView
          anchor={anchor}
          events={events}
          onDayClick={(date) => setModal({ initialDate: date })}
          onEventClick={(event) => setModal({ event })}
        />
      )}

      {modal && (
        <EventModal
          event={modal.event || null}
          initialDate={modal.initialDate || null}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
