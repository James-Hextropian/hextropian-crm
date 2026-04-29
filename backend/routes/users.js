import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// All user-management routes require admin
const adminOnly = requireRole('admin');

// GET /api/users/me — current user profile
router.get('/me', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.name, u.role, u.rep_id, u.is_active, u.last_login_at, u.created_at,
              sr.name AS rep_name
       FROM users u
       LEFT JOIN sales_reps sr ON u.rep_id = sr.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/me — update own profile
router.put('/me', async (req, res) => {
  const { name, email } = req.body;
  if (!name?.trim() || !email?.trim()) return res.status(400).json({ error: 'name and email are required' });
  try {
    const { rows } = await pool.query(
      'UPDATE users SET name=$1, email=$2 WHERE id=$3 RETURNING id, email, name, role, rep_id',
      [name.trim(), email.trim().toLowerCase(), req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/me/password — change own password
router.put('/me/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/users — list all users (admin)
router.get('/', adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.name, u.role, u.is_active, u.rep_id, u.last_login_at, u.created_at,
              sr.name AS rep_name
       FROM users u
       LEFT JOIN sales_reps sr ON u.rep_id = sr.id
       ORDER BY u.created_at DESC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/users — create user (admin)
router.post('/', adminOnly, async (req, res) => {
  const { email, password, name, role = 'sales_rep', rep_id } = req.body;
  if (!email?.trim() || !password || !name?.trim()) return res.status(400).json({ error: 'email, password, and name are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, name, role, rep_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, name, role, rep_id, is_active, created_at',
      [email.trim().toLowerCase(), hash, name.trim(), role, rep_id || null]
    );
    await pool.query(
      "INSERT INTO user_activity_log (user_id, action, resource_type, resource_id, ip_address, details) VALUES ($1,'create_user','user',$2,$3,$4)",
      [req.user.id, String(rows[0].id), req.ip, JSON.stringify({ created_email: email })]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id — get user detail (admin)
router.get('/:id', adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.name, u.role, u.is_active, u.rep_id, u.last_login_at, u.created_at,
              sr.name AS rep_name
       FROM users u LEFT JOIN sales_reps sr ON u.rep_id = sr.id
       WHERE u.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/:id — update user (admin)
router.put('/:id', adminOnly, async (req, res) => {
  const { name, email, role, rep_id, is_active } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE users SET name=$1, email=$2, role=$3, rep_id=$4, is_active=$5
       WHERE id=$6 RETURNING id, email, name, role, rep_id, is_active`,
      [name, email?.toLowerCase(), role, rep_id || null, is_active !== false, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    // If deactivating, revoke all refresh tokens
    if (is_active === false) {
      await pool.query('DELETE FROM refresh_tokens WHERE user_id=$1', [req.params.id]);
    }
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/deactivate — deactivate user (admin)
router.post('/:id/deactivate', adminOnly, async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot deactivate yourself' });
  try {
    await pool.query('UPDATE users SET is_active=false WHERE id=$1', [req.params.id]);
    await pool.query('DELETE FROM refresh_tokens WHERE user_id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/users/:id/reset-password — admin-triggered password reset
router.post('/:id/reset-password', adminOnly, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.params.id]);
    await pool.query('DELETE FROM refresh_tokens WHERE user_id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/users/activity/log — activity log (admin)
router.get('/activity/log', adminOnly, async (req, res) => {
  const { userId, limit = 100, offset = 0 } = req.query;
  try {
    const conditions = ['1=1'];
    const values = [];
    if (userId) { values.push(userId); conditions.push(`ual.user_id = $${values.length}`); }
    values.push(Number(limit));
    values.push(Number(offset));
    const { rows } = await pool.query(
      `SELECT ual.*, u.name AS user_name, u.email AS user_email
       FROM user_activity_log ual
       LEFT JOIN users u ON ual.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ual.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
