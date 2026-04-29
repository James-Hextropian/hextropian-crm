import { useEffect, useRef } from 'react';

// Auto-logout after `timeoutMs` of inactivity (default 30 min)
export function useInactivityLogout(logout, timeoutMs = 30 * 60 * 1000) {
  const timerRef = useRef(null);

  useEffect(() => {
    const reset = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(logout, timeoutMs);
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset(); // start timer

    return () => {
      clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [logout, timeoutMs]);
}
