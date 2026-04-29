import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// ── List / search ─────────────────────────────────────────────────────────────

// GET /api/contacts
router.get('/', async (req, res) => {
  const { search, vertical, status, company, owner_rep_id, page = '1', limit = '50' } = req.query;
  const pageNum  = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset   = (pageNum - 1) * limitNum;

  const conditions = [];
  const values = [];

  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(c.first_name ILIKE $${values.length} OR c.last_name ILIKE $${values.length} OR c.email ILIKE $${values.length} OR c.company ILIKE $${values.length} OR c.title ILIKE $${values.length})`);
  }
  if (vertical)      { values.push(vertical);           conditions.push(`c.vertical = $${values.length}`); }
  if (status)        { values.push(status);             conditions.push(`c.status = $${values.length}`); }
  if (company)       { values.push(`%${company}%`);     conditions.push(`c.company ILIKE $${values.length}`); }
  if (owner_rep_id === 'unassigned') {
    conditions.push('c.owner_rep_id IS NULL');
  } else if (owner_rep_id) {
    values.push(parseInt(owner_rep_id, 10));
    conditions.push(`c.owner_rep_id = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows: [{ total }] } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM contacts c ${where}`,
      [...values]
    );

    values.push(limitNum, offset);
    const { rows } = await pool.query(
      `SELECT c.*, sr.name AS owner_rep_name
       FROM contacts c
       LEFT JOIN sales_reps sr ON c.owner_rep_id = sr.id
       ${where}
       ORDER BY c.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    res.json({ contacts: rows, total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contacts/verticals — distinct vertical list with counts
router.get('/verticals', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        vertical,
        COUNT(*)::int AS total,
        SUM(CASE WHEN status = 'converted'  THEN 1 ELSE 0 END)::int AS converted,
        SUM(CASE WHEN status = 'no_interest' THEN 1 ELSE 0 END)::int AS no_interest,
        SUM(CASE WHEN status IN ('new','active') THEN 1 ELSE 0 END)::int AS available
      FROM contacts
      WHERE vertical IS NOT NULL AND vertical != ''
      GROUP BY vertical
      ORDER BY total DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contacts/distribution — lead ownership summary per rep
router.get('/distribution', async (req, res) => {
  try {
    const { rows: repRows } = await pool.query(`
      SELECT
        c.owner_rep_id,
        COALESCE(sr.name, 'Unassigned') AS rep_name,
        COUNT(*)::int                                                              AS total,
        SUM(CASE WHEN c.status = 'new'         THEN 1 ELSE 0 END)::int           AS new_count,
        SUM(CASE WHEN c.status = 'active'      THEN 1 ELSE 0 END)::int           AS active_count,
        SUM(CASE WHEN c.status = 'converted'   THEN 1 ELSE 0 END)::int           AS converted_count,
        SUM(CASE WHEN c.status = 'no_interest' THEN 1 ELSE 0 END)::int           AS no_interest_count
      FROM contacts c
      LEFT JOIN sales_reps sr ON c.owner_rep_id = sr.id
      GROUP BY c.owner_rep_id, sr.name
      ORDER BY total DESC
    `);

    const { rows: verticalRows } = await pool.query(`
      SELECT
        c.owner_rep_id,
        c.vertical,
        COUNT(*)::int AS count
      FROM contacts c
      WHERE c.vertical IS NOT NULL AND c.vertical != ''
        AND c.status = 'new'
      GROUP BY c.owner_rep_id, c.vertical
      ORDER BY count DESC
    `);

    // Attach top verticals to each rep row
    const byRepId = {};
    for (const r of repRows) {
      byRepId[r.owner_rep_id ?? 'null'] = { ...r, top_verticals: [] };
    }
    for (const v of verticalRows) {
      const key = v.owner_rep_id ?? 'null';
      if (byRepId[key] && byRepId[key].top_verticals.length < 5) {
        byRepId[key].top_verticals.push({ vertical: v.vertical, count: v.count });
      }
    }

    res.json(Object.values(byRepId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts/assign-bulk — assign (or unassign) a batch of contacts to a rep
router.post('/assign-bulk', async (req, res) => {
  const { contact_ids, rep_id } = req.body;
  if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
    return res.status(400).json({ error: 'contact_ids array required' });
  }
  const repIdVal = rep_id ? parseInt(rep_id, 10) : null;
  try {
    const { rowCount } = await pool.query(
      `UPDATE contacts
       SET owner_rep_id = $1,
           assigned_at  = CASE WHEN $1 IS NOT NULL THEN NOW() ELSE NULL END
       WHERE id = ANY($2)`,
      [repIdVal, contact_ids]
    );
    res.json({ updated: rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contacts/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, sr.name AS owner_rep_name
       FROM contacts c
       LEFT JOIN sales_reps sr ON c.owner_rep_id = sr.id
       WHERE c.id=$1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts — add single contact
router.post('/', async (req, res) => {
  const { first_name, last_name, email, linkedin_url, company, title, vertical, phone, owner_rep_id } = req.body;
  const repIdVal = owner_rep_id ? parseInt(owner_rep_id, 10) : null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO contacts (first_name, last_name, email, linkedin_url, company, title, vertical, phone, owner_rep_id, assigned_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CASE WHEN $9 IS NOT NULL THEN NOW() ELSE NULL END)
       ON CONFLICT (email) DO UPDATE SET
         first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
         linkedin_url=EXCLUDED.linkedin_url, company=EXCLUDED.company,
         title=EXCLUDED.title, vertical=EXCLUDED.vertical, phone=EXCLUDED.phone
       RETURNING *`,
      [first_name, last_name, email || null, linkedin_url || null, company, title, vertical, phone || null, repIdVal]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts/import — bulk import (max 500 per batch)
router.post('/import', async (req, res) => {
  const { contacts: batch, owner_rep_id } = req.body;
  if (!Array.isArray(batch) || batch.length === 0) return res.status(400).json({ error: 'contacts array required' });
  if (batch.length > 500) return res.status(400).json({ error: 'Max 500 contacts per batch' });

  const repIdVal = owner_rep_id ? parseInt(owner_rep_id, 10) : null;
  const fields = ['first_name', 'last_name', 'email', 'linkedin_url', 'company', 'title', 'vertical', 'phone'];
  const values = [];
  const placeholders = batch.map((c, i) => {
    const base = i * fields.length;
    fields.forEach((f) => values.push(c[f] || null));
    return `(${fields.map((_, j) => `$${base + j + 1}`).join(',')})`;
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `WITH ins AS (
        INSERT INTO contacts (${fields.join(',')})
        VALUES ${placeholders.join(',')}
        ON CONFLICT (email) DO NOTHING
        RETURNING id
      ) SELECT ARRAY_AGG(id) AS ids, COUNT(*)::int AS inserted FROM ins`,
      values
    );
    const inserted   = rows[0].inserted;
    const insertedIds = rows[0].ids || [];

    // Assign to rep if specified
    if (repIdVal && insertedIds.length > 0) {
      await client.query(
        `UPDATE contacts SET owner_rep_id=$1, assigned_at=NOW() WHERE id = ANY($2)`,
        [repIdVal, insertedIds]
      );
    }

    await client.query('COMMIT');
    res.json({ inserted, skipped: batch.length - inserted, total_sent: batch.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/contacts/:id
router.put('/:id', async (req, res) => {
  const { first_name, last_name, email, linkedin_url, company, title, vertical, phone, owner_rep_id } = req.body;
  const repIdVal = owner_rep_id !== undefined ? (owner_rep_id ? parseInt(owner_rep_id, 10) : null) : undefined;
  try {
    const setOwner = repIdVal !== undefined
      ? ', owner_rep_id=$9, assigned_at=CASE WHEN $9 IS NOT NULL THEN NOW() ELSE NULL END'
      : '';
    const params = [first_name, last_name, email || null, linkedin_url || null, company, title, vertical, phone || null];
    if (repIdVal !== undefined) params.push(repIdVal);
    params.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE contacts SET first_name=$1, last_name=$2, email=$3, linkedin_url=$4,
        company=$5, title=$6, vertical=$7, phone=$8${setOwner}
       WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/contacts/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM contacts WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── No Interest ───────────────────────────────────────────────────────────────

// POST /api/contacts/:id/no-interest
router.post('/:id/no-interest', async (req, res) => {
  const { reason, rep_id } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE contacts SET status='no_interest', no_interest_reason=$1 WHERE id=$2 RETURNING *`,
      [reason || null, req.params.id]
    );
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    await client.query(`UPDATE workqueue SET completed=TRUE WHERE contact_id=$1`, [req.params.id]);
    await client.query(
      `INSERT INTO outreach_history (contact_id, rep_id, stage, notes) VALUES ($1,$2,'no_interest',$3)`,
      [req.params.id, rep_id || null, reason || null]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── Convert to Account ────────────────────────────────────────────────────────

// POST /api/contacts/:id/convert
router.post('/:id/convert', async (req, res) => {
  const { deal_stage = 'Prospecting', owner_id, rep_id } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [contact] } = await client.query('SELECT * FROM contacts WHERE id=$1', [req.params.id]);
    if (!contact) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Contact not found' }); }

    const { rows: [customer] } = await client.query(
      `INSERT INTO customers
        (company_name, contact_person, email, phone, industry, deal_stage, owner_id, stage_entry_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE) RETURNING *`,
      [
        contact.company || `${contact.first_name} ${contact.last_name}`.trim(),
        `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
        contact.email,
        contact.phone,
        contact.vertical,
        deal_stage,
        owner_id || null,
      ]
    );

    await client.query(
      `INSERT INTO stage_history (customer_id, from_stage, to_stage) VALUES ($1, NULL, $2)`,
      [customer.id, deal_stage]
    );
    await client.query(
      `UPDATE contacts SET status='converted', converted_account_id=$1 WHERE id=$2`,
      [customer.id, req.params.id]
    );
    await client.query(`UPDATE workqueue SET completed=TRUE WHERE contact_id=$1`, [req.params.id]);
    await client.query(
      `INSERT INTO outreach_history (contact_id, rep_id, stage) VALUES ($1,$2,'converted')`,
      [req.params.id, rep_id || null]
    );

    await client.query('COMMIT');
    res.json({ contact: { ...contact, status: 'converted', converted_account_id: customer.id }, customer });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── Notes ─────────────────────────────────────────────────────────────────────

// GET /api/contacts/:id/notes
router.get('/:id/notes', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT cn.*, sr.name AS rep_name
      FROM contact_notes cn
      LEFT JOIN sales_reps sr ON cn.rep_id = sr.id
      WHERE cn.contact_id=$1
      ORDER BY cn.created_at DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts/:id/notes
router.post('/:id/notes', async (req, res) => {
  const { content, rep_id } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO contact_notes (contact_id, rep_id, content) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, rep_id || null, content]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contacts/:id/history
router.get('/:id/history', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT oh.*, sr.name AS rep_name
      FROM outreach_history oh
      LEFT JOIN sales_reps sr ON oh.rep_id = sr.id
      WHERE oh.contact_id=$1
      ORDER BY oh.completed_at ASC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
