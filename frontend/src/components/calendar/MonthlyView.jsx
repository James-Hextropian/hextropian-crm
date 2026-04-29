import { useMemo } from 'react';

const EVENT_COLORS = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#06b6d4', '#f97316',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function MonthlyView({ anchor, events, onDayClick, onEventClick }) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const cells = [];

    for (let i = 0; i < firstDay.getDay(); i++) {
      cells.push({ date: new Date(year, month, 1 - firstDay.getDay() + i), thisMonth: false });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      cells.push({ date: new Date(year, month, d), thisMonth: true });
    }
    let next = 1;
    while (cells.length % 7 !== 0) {
      cells.push({ date: new Date(year, month + 1, next++), thisMonth: false });
    }
    return cells;
  }, [year, month]);

  const eventsByDay = useMemo(() => {
    const map = {};
    events.forEach((ev, idx) => {
      const key = new Date(ev.start_time).toDateString();
      if (!map[key]) map[key] = [];
      map[key].push({ ev, color: EVENT_COLORS[idx % EVENT_COLORS.length] });
    });
    return map;
  }, [events]);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
        {WEEKDAYS.map((d) => (
          <div key={d} style={{
            padding: '8px 4px', textAlign: 'center',
            fontSize: 11, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600,
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {days.map(({ date, thisMonth }, i) => {
          const isToday = date.toDateString() === today.toDateString();
          const dayEvents = eventsByDay[date.toDateString()] || [];
          const isLastRow = i >= days.length - 7;
          const isLastCol = (i + 1) % 7 === 0;
          return (
            <div key={i} style={{
              minHeight: 96, padding: '4px',
              borderRight: isLastCol ? 'none' : '1px solid var(--border)',
              borderBottom: isLastRow ? 'none' : '1px solid var(--border)',
              opacity: thisMonth ? 1 : 0.35,
              background: isToday ? 'rgba(108,99,255,0.06)' : 'transparent',
              cursor: 'pointer',
            }}
              onClick={() => { const d = new Date(date); d.setHours(9, 0, 0, 0); onDayClick(d); }}
            >
              <div style={{
                display: 'inline-flex', width: 26, height: 26,
                alignItems: 'center', justifyContent: 'center',
                borderRadius: '50%', fontSize: 13, fontWeight: 600, marginBottom: 3,
                background: isToday ? 'var(--accent)' : 'transparent',
                color: isToday ? '#fff' : 'var(--text)',
              }}>
                {date.getDate()}
              </div>
              {dayEvents.slice(0, 3).map(({ ev, color }, idx) => (
                <div key={idx} style={{
                  background: color + '22', borderLeft: `2px solid ${color}`,
                  borderRadius: 3, padding: '1px 5px', fontSize: 11, fontWeight: 500,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  marginBottom: 2, color: 'var(--text)',
                }}
                  onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                >
                  {ev.title}
                </div>
              ))}
              {dayEvents.length > 3 && (
                <div style={{ fontSize: 10, color: 'var(--muted)', paddingLeft: 4 }}>
                  +{dayEvents.length - 3} more
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
