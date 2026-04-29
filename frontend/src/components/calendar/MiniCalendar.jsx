import { useState, useEffect } from 'react';
import { authFetch } from '../../context/AuthContext';

export default function MiniCalendar({ onOpenCalendar }) {
  const [anchor, setAnchor] = useState(new Date());
  const [events, setEvents] = useState([]);

  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 1);
    authFetch(`/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`)
      .then(setEvents)
      .catch(() => {});
  }, [year, month]);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const eventDays = new Set(events.map((e) => new Date(e.start_time).getDate()));

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const upcoming = events
    .filter((e) => new Date(e.start_time) >= today)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    .slice(0, 3);

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '2px 4px' }}
          onClick={() => setAnchor((p) => { const d = new Date(p); d.setMonth(d.getMonth() - 1); return d; })}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '2px 4px' }}
          onClick={() => setAnchor((p) => { const d = new Date(p); d.setMonth(d.getMonth() + 1); return d; })}>›</button>
      </div>

      {/* Weekday labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const thisDate = new Date(year, month, day);
          const isToday = thisDate.toDateString() === today.toDateString();
          const hasEvent = eventDays.has(day);
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => { const d = new Date(year, month, day, 9); onOpenCalendar?.(d); }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isToday ? 'var(--accent)' : 'transparent',
                color: isToday ? '#fff' : 'var(--text)',
                fontSize: 12, fontWeight: isToday ? 700 : 400,
                transition: 'background 0.1s',
              }}
                onMouseEnter={(e) => { if (!isToday) e.currentTarget.style.background = 'var(--surface2)'; }}
                onMouseLeave={(e) => { if (!isToday) e.currentTarget.style.background = 'transparent'; }}
              >
                {day}
              </div>
              {hasEvent && (
                <div style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: isToday ? 'rgba(255,255,255,0.7)' : 'var(--accent)',
                  marginTop: -3,
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Upcoming events */}
      {upcoming.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Upcoming
          </div>
          {upcoming.map((ev) => (
            <div key={ev.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
              <span style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>
                {new Date(ev.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
            </div>
          ))}
        </div>
      )}

      {upcoming.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>No upcoming events</p>
      )}
    </div>
  );
}
