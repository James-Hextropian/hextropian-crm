import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { getOAuthClient, getStoredTokens, storeTokens } from '../auth/gmail.js';

const router = Router();

const JWT_SECRET         = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const APP_URL            = process.env.APP_URL || 'http://localhost:5173';

const ACCESS_TTL  = 15 * 60;          // 15 minutes
const REFRESH_TTL = 7 * 24 * 3600;    // 7 days
const REMEMBER_TTL = 30 * 24 * 3600;  // 30 days

function signAccess(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, rep_id: user.rep_id },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function signRefresh(user, rememberMe = false) {
  return jwt.sign(
    { id: user.id },
    JWT_REFRESH_SECRET,
    { expiresIn: rememberMe ? REMEMBER_TTL : REFRESH_TTL }
  );
}

const IS_PROD = process.env.NODE_ENV === 'production';

function setTokenCookies(res, accessToken, refreshToken, rememberMe = false) {
  const cookieOpts = {
    httpOnly: true,
    sameSite: IS_PROD ? 'strict' : 'lax',
    secure:   IS_PROD,   // HTTPS only in production
    path:     '/',
  };
  res.cookie('access_token', accessToken, {
    ...cookieOpts,
    maxAge: ACCESS_TTL * 1000,
  });
  res.cookie('refresh_token', refreshToken, {
    ...cookieOpts,
    maxAge: (rememberMe ? REMEMBER_TTL : REFRESH_TTL) * 1000,
  });
}

// ── Email/Password Auth ─────────────────────────────────────────────────────

// POST /api/auth/signup
// Only admin can create users — unless zero users exist (bootstrapping)
router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email?.trim() || !password || !name?.trim()) {
    return res.status(400).json({ error: 'email, password, and name are required' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const { rows: [countRow] } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
    const isBootstrap = countRow.n === 0;

    // If not bootstrapping, require admin auth (handled by middleware on the route)
    if (!isBootstrap) {
      const token = req.cookies?.access_token;
      if (!token) return res.status(401).json({ error: 'Admin authentication required' });
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
      } catch { return res.status(401).json({ error: 'Invalid session' }); }
    }

    const hash = await bcrypt.hash(password, 12);
    const role = isBootstrap ? 'admin' : (req.body.role || 'sales_rep');
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING id, email, name, role, rep_id',
      [email.trim().toLowerCase(), hash, name.trim(), role]
    );
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password, rememberMe = false } = req.body;
  if (!email?.trim() || !password) return res.status(400).json({ error: 'email and password are required' });

  try {
    const { rows } = await pool.query(
      'SELECT id, email, password_hash, name, role, rep_id, is_active FROM users WHERE email=$1',
      [email.trim().toLowerCase()]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid email or password' });

    const user = rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'Account deactivated' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    // Issue tokens
    const accessToken  = signAccess(user);
    const refreshToken = signRefresh(user, rememberMe);
    const tokenHash    = await bcrypt.hash(refreshToken, 10);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,NOW()+$3::interval)',
      [user.id, tokenHash, `${rememberMe ? REMEMBER_TTL : REFRESH_TTL} seconds`]
    );
    await pool.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);
    await pool.query(
      "INSERT INTO user_activity_log (user_id, action, ip_address) VALUES ($1,'login',$2)",
      [user.id, req.ip]
    );

    setTokenCookies(res, accessToken, refreshToken, rememberMe);
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, rep_id: user.rep_id } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const rawRefresh = req.cookies?.refresh_token;
  if (rawRefresh) {
    try {
      const payload = jwt.verify(rawRefresh, JWT_REFRESH_SECRET);
      // Find and delete matching token row
      const { rows } = await pool.query(
        'SELECT id, token_hash FROM refresh_tokens WHERE user_id=$1 AND expires_at > NOW()',
        [payload.id]
      );
      for (const row of rows) {
        const match = await bcrypt.compare(rawRefresh, row.token_hash);
        if (match) { await pool.query('DELETE FROM refresh_tokens WHERE id=$1', [row.id]); break; }
      }
      if (payload.id) {
        await pool.query("INSERT INTO user_activity_log (user_id, action, ip_address) VALUES ($1,'logout',$2)", [payload.id, req.ip]);
      }
    } catch {}
  }
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  res.json({ ok: true });
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const rawRefresh = req.cookies?.refresh_token;
  if (!rawRefresh) return res.status(401).json({ error: 'No refresh token' });

  try {
    const payload = jwt.verify(rawRefresh, JWT_REFRESH_SECRET);
    const { rows } = await pool.query(
      `SELECT rt.id, rt.token_hash, u.id AS uid, u.email, u.name, u.role, u.rep_id, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.user_id=$1 AND rt.expires_at > NOW()`,
      [payload.id]
    );

    // Find the matching hashed token
    let matchedRow = null;
    for (const row of rows) {
      const ok = await bcrypt.compare(rawRefresh, row.token_hash);
      if (ok) { matchedRow = row; break; }
    }
    if (!matchedRow) return res.status(401).json({ error: 'Invalid refresh token' });
    if (!matchedRow.is_active) return res.status(403).json({ error: 'Account deactivated' });

    // Rotate: delete old, issue new
    await pool.query('DELETE FROM refresh_tokens WHERE id=$1', [matchedRow.id]);
    const user = { id: matchedRow.uid, email: matchedRow.email, name: matchedRow.name, role: matchedRow.role, rep_id: matchedRow.rep_id };
    const newAccess  = signAccess(user);
    const newRefresh = signRefresh(user);
    const newHash    = await bcrypt.hash(newRefresh, 10);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,NOW()+$3::interval)',
      [user.id, newHash, `${REFRESH_TTL} seconds`]
    );
    setTokenCookies(res, newAccess, newRefresh);
    res.json({ ok: true });
  } catch { res.status(401).json({ error: 'Invalid or expired refresh token' }); }
});

// GET /api/auth/me — return current user from access token
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.name, u.role, u.rep_id, u.last_login_at,
              sr.name AS rep_name,
              u.google_tokens IS NOT NULL AS google_connected
       FROM users u LEFT JOIN sales_reps sr ON u.rep_id = sr.id
       WHERE u.id=$1 AND u.is_active=true`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  // Always return 200 to prevent email enumeration
  res.json({ ok: true, message: 'If that email exists, a reset link has been sent.' });
  if (!email?.trim()) return;

  try {
    const { rows } = await pool.query('SELECT id, name FROM users WHERE email=$1 AND is_active=true', [email.trim().toLowerCase()]);
    if (!rows.length) return;

    const user = rows[0];
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,NOW()+interval\'1 hour\')',
      [user.id, tokenHash]
    );

    const resetUrl = `${APP_URL}/reset-password?token=${rawToken}&uid=${user.id}`;

    // Send via Gmail (fire and forget)
    try {
      const { getAuthorizedClient } = await import('../auth/gmail.js');
      const { google } = await import('googleapis');
      const auth = await getAuthorizedClient();
      const gmail = google.gmail({ version: 'v1', auth });
      const html = `
        <p>Hi ${user.name},</p>
        <p>Someone requested a password reset for your Hextropian CRM account.</p>
        <p><a href="${resetUrl}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Reset Password</a></p>
        <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        <p style="color:#6b7280;font-size:12px">Or copy this URL: ${resetUrl}</p>
      `;
      const mime = [
        'MIME-Version: 1.0',
        `To: ${email.trim()}`,
        `Subject: Reset your Hextropian CRM password`,
        'Content-Type: text/html; charset=UTF-8', '',
        html,
      ].join('\r\n');
      const raw = Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    } catch (mailErr) {
      console.error('Password reset email failed:', mailErr.message);
    }
  } catch (err) { console.error('Forgot password error:', err.message); }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, uid, newPassword } = req.body;
  if (!token || !uid || !newPassword) return res.status(400).json({ error: 'token, uid, and newPassword are required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const { rows } = await pool.query(
      'SELECT id, token_hash FROM password_reset_tokens WHERE user_id=$1 AND expires_at > NOW() AND used_at IS NULL',
      [uid]
    );
    let matched = null;
    for (const row of rows) {
      const ok = await bcrypt.compare(token, row.token_hash);
      if (ok) { matched = row; break; }
    }
    if (!matched) return res.status(400).json({ error: 'Invalid or expired reset token' });

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, uid]);
    await pool.query('UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1', [matched.id]);
    await pool.query('DELETE FROM refresh_tokens WHERE user_id=$1', [uid]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Google OAuth (Gmail + Calendar) ─────────────────────────────────────────

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar',
];

// GET /api/auth/status — Gmail connection status (backward compat)
router.get('/status', (req, res) => {
  const tokens = getStoredTokens();
  res.json({ connected: !!tokens, email: tokens?.email ?? null });
});

// GET /api/auth/google — redirect to Google OAuth
router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env' });
  }
  const url = getOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
  });
  res.redirect(url);
});

// GET /api/auth/google/callback
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.status(400).send(`Google auth error: ${error}`);
  try {
    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const { google } = await import('googleapis');
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();

    // Store in file (for backward compat with gmail.js) + in users table if logged in
    storeTokens({ ...tokens, email: data.email });

    // Also update the logged-in user's google_tokens in DB
    try {
      const accessToken = req.cookies?.access_token;
      if (accessToken) {
        const payload = jwt.verify(accessToken, JWT_SECRET);
        await pool.query('UPDATE users SET google_tokens=$1 WHERE id=$2', [JSON.stringify({ ...tokens, email: data.email }), payload.id]);
      }
    } catch {}

    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:4rem;background:#0f1117;color:#e8eaf0">
        <h2>✓ Google connected</h2>
        <p>Signed in as <strong>${data.email}</strong></p>
        <p>Gmail and Calendar are now connected. You can close this tab.</p>
        <script>setTimeout(() => window.close(), 2000)</script>
      </body></html>
    `);
  } catch (err) {
    res.status(500).send(`Auth failed: ${err.message}`);
  }
});

// POST /api/auth/disconnect
router.post('/disconnect', requireAuth, async (req, res) => {
  const { unlinkSync, existsSync } = await import('fs');
  const path = new URL('../.gmail-tokens.json', import.meta.url).pathname;
  if (existsSync(path)) unlinkSync(path);
  await pool.query('UPDATE users SET google_tokens=NULL WHERE id=$1', [req.user.id]);
  res.json({ connected: false });
});

export default router;
