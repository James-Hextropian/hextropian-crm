import { useMemo } from 'react';

const HOUR_START = 7;
const HOUR_END = 21;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START);
const SLOT_H = 56;
const LABEL_W = 52;

const EVENT_COLORS = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#06b6d4', '#f97316',
];

function fmtHour(h) {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

export default function WeeklyView({ anchor, events, onSlotClick, onEventClick }) {
  const days = useMemo(() => {
    const start = new Date(anchor);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [anchor]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const placed = useMemo(() => {
    return events.flatMap((ev, idx) => {
      const start = new Date(ev.start_time);
      const end = new Date(ev.end_time);
      const dayIdx = days.findIndex((d) => d.toDateString() === start.toDateString());
      if (dayIdx < 0) return [];
      const startH = start.getHours() + start.getMinutes() / 60;
      const endH = end.getHours() + end.getMinutes() / 60;
      const clampedStart = Math.max(startH, HOUR_START);
      const clampedEnd = Math.min(endH, HOUR_END);
      if (clampedEnd <= clampedStart) return [];
      const top = (clampedStart - HOUR_START) * SLOT_H;
      const height = Math.max(22, (clampedEnd - clampedStart) * SLOT_H - 2);
      return [{ ev, dayIdx, top, height, color: EVENT_COLORS[idx % EVENT_COLORS.length] }];
    });
  }, [events, days]);

  const handleColumnClick = (day, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const rawHour = offsetY / SLOT_H + HOUR_START;
    const hour = Math.floor(rawHour);
    const minute = Math.round((rawHour - hour) * 60 / 15) * 15;
    const d = new Date(day);
    d.setHours(hour, minute < 60 ? minute : 0, 0, 0);
    onSlotClick(d);
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      {/* Day headers */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface)' }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        {days.map((d, i) => {
          const isToday = d.toDateString() === today.toDateString();
          return (
            <div key={i} style={{
              flex: 1, textAlign: 'center', padding: '10px 4px',
              borderLeft: '1px solid var(--border)',
              background: isToday ? 'rgba(108,99,255,0.07)' : 'transparent',
            }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {d.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', margin: '4px auto 0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isToday ? 'var(--accent)' : 'transparent',
                color: isToday ? '#fff' : 'var(--text)',
                fontSize: 15, fontWeight: 700,
              }}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div style={{ display: 'flex', overflowY: 'auto', maxHeight: 'calc(100vh - 290px)' }}>
        {/* Hour labels */}
        <div style={{ width: LABEL_W, flexShrink: 0, paddingTop: 0 }}>
          {HOURS.map((h) => (
            <div key={h} style={{ height: SLOT_H, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: 8, paddingTop: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtHour(h)}</span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day, colIdx) => {
          const isToday = day.toDateString() === today.toDateString();
          const colEvents = placed.filter((p) => p.dayIdx === colIdx);
          return (
            <div key={colIdx}
              style={{
                flex: 1, borderLeft: '1px solid var(--border)', position: 'relative',
                background: isToday ? 'rgba(108,99,255,0.03)' : 'transparent',
                cursor: 'pointer',
                height: HOURS.length * SLOT_H,
              }}
              onClick={(e) => { if (!e.defaultPrevented) handleColumnClick(day, e); }}
            >
              {/* Hour grid lines */}
              {HOURS.map((h) => (
                <div key={h} style={{
                  position: 'absolute', top: (h - HOUR_START) * SLOT_H, left: 0, right: 0,
                  height: SLOT_H, borderBottom: '1px solid var(--border)', boxSizing: 'border-box',
                }} />
              ))}

              {/* Events */}
              {colEvents.map(({ ev, top, height, color }, i) => (
                <div key={i} style={{
                  position: 'absolute', top, left: 2, right: 2, height,
                  background: color + '28', borderLeft: `3px solid ${color}`,
                  borderRadius: 4, padding: '2px 5px', overflow: 'hidden',
                  cursor: 'pointer', fontSize: 11, lineHeight: 1.3, zIndex: 1,
                }}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEventClick(ev); }}
                >
                  <div style={{ fontWeight: 700, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ev.title}
                  </div>
                  {height > 32 && (
                    <div style={{ color: 'var(--muted)', fontSize: 10 }}>
                      {new Date(ev.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
