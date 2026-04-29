import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const BASE = '/api';

async function apiFetch(url, options = {}) {
  const res = await fetch(url, { ...options, credentials: 'include' });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try { msg = JSON.parse(text).error || text; } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return null;
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const me = await apiFetch(`${BASE}/auth/me`);
      setUser(me);
      return me;
    } catch (err) {
      if (err.status === 401 && err.message === 'Token expired') {
        // Try silent refresh
        try {
          await apiFetch(`${BASE}/auth/refresh`, { method: 'POST' });
          const me = await apiFetch(`${BASE}/auth/me`);
          setUser(me);
          return me;
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    fetchMe().finally(() => setLoading(false));
  }, [fetchMe]);

  const login = useCallback(async (email, password, rememberMe = false) => {
    const data = await apiFetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, rememberMe }),
    });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await apiFetch(`${BASE}/auth/logout`, { method: 'POST' }); } catch {}
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await fetchMe();
    return me;
  }, [fetchMe]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Authenticated fetch wrapper used throughout the app
export async function authFetch(url, options = {}) {
  const res = await fetch(url, { ...options, credentials: 'include' });

  if (res.status === 401) {
    let body = {};
    try { body = await res.clone().json(); } catch {}
    if (body.code === 'TOKEN_EXPIRED') {
      const refreshRes = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (refreshRes.ok) {
        const retryRes = await fetch(url, { ...options, credentials: 'include' });
        if (!retryRes.ok) throw new Error(await retryRes.text());
        return retryRes.json();
      }
      window.location.reload(); // force re-login
      throw new Error('Session expired');
    }
    throw new Error(body.error || 'Not authenticated');
  }

  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try { msg = JSON.parse(text).error || text; } catch {}
    throw new Error(msg);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return null;
}
