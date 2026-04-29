import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/customers
router.get('/', async (req, res) => {
  const { search, industry, deal_stage, owner, sort = 'company_name', order = 'asc' } = req.query;

  const ALLOWED_SORT = ['company_name', 'deal_value', 'last_contact_date', 'deal_stage', 'industry', 'created_at', 'expected_close_date', 'probability'];
  const sort_col = ALLOWED_SORT.includes(sort) ? `c.${sort}` : 'c.company_name';
  const sort_dir = order === 'desc' ? 'DESC' : 'ASC';

  const conditions = [];
  const values = [];

  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(c.company_name ILIKE $${values.length} OR c.contact_person ILIKE $${values.length} OR c.email ILIKE $${values.length} OR c.notes ILIKE $${values.length})`);
  }
  if (industry) { values.push(industry); conditions.push(`c.industry = $${values.length}`); }
  if (deal_stage) { values.push(deal_stage); conditions.push(`c.deal_stage = $${values.length}`); }
  if (owner) { values.push(owner); conditions.push(`c.owner_id = $${values.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT c.*,
      sr.name AS owner_name,
      CASE WHEN c.stage_entry_date IS NOT NULL THEN (CURRENT_DATE - c.stage_entry_date) ELSE 0 END AS days_in_stage,
      CASE WHEN c.deal_value IS NOT NULL AND c.probability IS NOT NULL
        THEN c.deal_value * c.probability / 100.0 ELSE NULL END AS weighted_value
    FROM customers c
    LEFT JOIN sales_reps sr ON c.owner_id = sr.id
    ${where}
    ORDER BY ${sort_col} ${sort_dir}
  `;

  try {
    const { rows } = await pool.query(sql, values);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const { rows: stages } = await pool.query(`
      SELECT deal_stage, COUNT(*)::int AS count, COALESCE(SUM(deal_value), 0) AS total_value
      FROM customers GROUP BY deal_stage ORDER BY deal_stage
    `);

    const { rows: industries } = await pool.query(`
      SELECT industry, COUNT(*)::int AS count, COALESCE(SUM(deal_value), 0) AS total_value
      FROM customers GROUP BY industry ORDER BY total_value DESC
    `);

    const { rows: [totals] } = await pool.query(`
      SELECT
        COUNT(*)::int AS total_customers,
        COALESCE(SUM(deal_value), 0) AS total_pipeline,
        COALESCE(SUM(CASE WHEN deal_stage = 'Closed-Won' THEN deal_value END), 0) AS active_revenue,
        COALESCE(SUM(CASE WHEN deal_stage NOT IN ('Closed-Won','Closed-Lost','Post-Sale')
                     THEN deal_value END), 0) AS pipeline_value
      FROM customers
    `);

    res.json({ totals, stages, industries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/export
router.get('/export', async (req, res) => {
  const { industry, deal_stage, owner } = req.query;
  const conditions = [];
  const values = [];
  if (industry) { values.push(industry); conditions.push(`c.industry = $${values.length}`); }
  if (deal_stage) { values.push(deal_stage); conditions.push(`c.deal_stage = $${values.length}`); }
  if (owner) { values.push(owner); conditions.push(`c.owner_id = $${values.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT c.company_name, c.contact_person, c.email, c.phone, c.industry, c.deal_stage,
        c.deal_value, c.expected_close_date, c.probability, sr.name AS owner_name,
        c.stage_entry_date, c.last_contact_date, c.notes, c.created_at
       FROM customers c LEFT JOIN sales_reps sr ON c.owner_id = sr.id
       ${where} ORDER BY c.company_name`,
      values
    );
    const headers = ['Company', 'Contact', 'Email', 'Phone', 'Industry', 'Stage', 'Deal Value', 'Expected Close', 'Probability', 'Owner', 'Stage Entry', 'Last Contact', 'Notes', 'Created At'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...rows.map(r => [
        r.company_name, r.contact_person, r.email, r.phone,
        r.industry, r.deal_stage, r.deal_value, r.expected_close_date,
        r.probability != null ? `${r.probability}%` : '', r.owner_name,
        r.stage_entry_date, r.last_contact_date, r.notes, r.created_at,
      ].map(esc).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="hextropian-crm-export.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*,
        sr.name AS owner_name,
        CASE WHEN c.stage_entry_date IS NOT NULL THEN (CURRENT_DATE - c.stage_entry_date) ELSE 0 END AS days_in_stage,
        CASE WHEN c.deal_value IS NOT NULL AND c.probability IS NOT NULL
          THEN c.deal_value * c.probability / 100.0 ELSE NULL END AS weighted_value
      FROM customers c LEFT JOIN sales_reps sr ON c.owner_id = sr.id
      WHERE c.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers
router.post('/', async (req, res) => {
  const {
    company_name, contact_person, email, phone, industry, deal_stage, deal_value,
    last_contact_date, notes, owner_id, expected_close_date, probability,
  } = req.body;
  if (!company_name) return res.status(400).json({ error: 'company_name is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO customers
        (company_name, contact_person, email, phone, industry, deal_stage, deal_value,
         last_contact_date, notes, owner_id, expected_close_date, probability, stage_entry_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_DATE) RETURNING *`,
      [company_name, contact_person, email, phone, industry, deal_stage,
       deal_value || null, last_contact_date || null, notes,
       owner_id || null, expected_close_date || null, probability || null]
    );
    const customer = rows[0];
    if (deal_stage) {
      await client.query(
        'INSERT INTO stage_history (customer_id, from_stage, to_stage) VALUES ($1, NULL, $2)',
        [customer.id, deal_stage]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(customer);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/customers/:id
router.put('/:id', async (req, res) => {
  const {
    company_name, contact_person, email, phone, industry, deal_stage, deal_value,
    last_contact_date, notes, owner_id, expected_close_date, probability,
  } = req.body;
  if (!company_name) return res.status(400).json({ error: 'company_name is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: current } = await client.query('SELECT deal_stage FROM customers WHERE id=$1', [req.params.id]);
    if (!current.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }

    const stageChanged = deal_stage && deal_stage !== current[0].deal_stage;

    if (stageChanged) {
      await client.query(
        'UPDATE stage_history SET exited_at = NOW() WHERE customer_id=$1 AND to_stage=$2 AND exited_at IS NULL',
        [req.params.id, current[0].deal_stage]
      );
      await client.query(
        'INSERT INTO stage_history (customer_id, from_stage, to_stage) VALUES ($1,$2,$3)',
        [req.params.id, current[0].deal_stage, deal_stage]
      );
    }

    const { rows } = await client.query(
      `UPDATE customers SET
        company_name=$1, contact_person=$2, email=$3, phone=$4,
        industry=$5, deal_stage=$6, deal_value=$7, last_contact_date=$8, notes=$9,
        owner_id=$10, expected_close_date=$11, probability=$12,
        stage_entry_date = CASE WHEN $13 THEN CURRENT_DATE ELSE stage_entry_date END,
        stage_exit_date  = CASE WHEN $13 THEN CURRENT_DATE ELSE stage_exit_date  END
       WHERE id=$14 RETURNING *`,
      [
        company_name, contact_person, email, phone,
        industry, deal_stage, deal_value || null, last_contact_date || null, notes,
        owner_id || null, expected_close_date || null, probability || null,
        stageChanged, req.params.id,
      ]
    );
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/customers/:id/owner — quick owner reassignment
router.put('/:id/owner', async (req, res) => {
  const { owner_id } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE customers SET owner_id=$1 WHERE id=$2 RETURNING *',
      [owner_id || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/customers/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM customers WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Notes ─────────────────────────────────────────────────────────────────────

router.get('/:id/notes', async (req, res) => {
  const { sort = 'desc', date_from, date_to } = req.query;
  const order = sort === 'asc' ? 'ASC' : 'DESC';
  const conditions = ['customer_id=$1'];
  const values = [req.params.id];
  if (date_from) { values.push(date_from); conditions.push(`created_at >= $${values.length}`); }
  if (date_to)   { values.push(date_to);   conditions.push(`created_at <  ($${values.length}::date + interval '1 day')`); }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM customer_notes WHERE ${conditions.join(' AND ')} ORDER BY created_at ${order}`,
      values
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/notes', async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content is required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO customer_notes (customer_id, content) VALUES ($1,$2) RETURNING *',
      [req.params.id, content]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/notes/:noteId', async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content is required' });
  try {
    const { rows } = await pool.query(
      'UPDATE customer_notes SET content=$1 WHERE id=$2 AND customer_id=$3 RETURNING *',
      [content, req.params.noteId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/notes/:noteId', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM customer_notes WHERE id=$1 AND customer_id=$2',
      [req.params.noteId, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Contacts ──────────────────────────────────────────────────────────────────

router.get('/:id/contacts', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM customer_contacts WHERE customer_id=$1 ORDER BY is_primary DESC, first_name ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/contacts', async (req, res) => {
  const { first_name, last_name, title, email, phone, is_primary } = req.body;
  try {
    if (is_primary) {
      await pool.query('UPDATE customer_contacts SET is_primary=false WHERE customer_id=$1', [req.params.id]);
    }
    const { rows } = await pool.query(
      `INSERT INTO customer_contacts (customer_id, first_name, last_name, title, email, phone, is_primary)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, first_name, last_name, title, email, phone, is_primary || false]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/contacts/:contactId', async (req, res) => {
  const { first_name, last_name, title, email, phone, is_primary } = req.body;
  try {
    if (is_primary) {
      await pool.query(
        'UPDATE customer_contacts SET is_primary=false WHERE customer_id=$1 AND id!=$2',
        [req.params.id, req.params.contactId]
      );
    }
    const { rows } = await pool.query(
      `UPDATE customer_contacts SET first_name=$1, last_name=$2, title=$3, email=$4, phone=$5, is_primary=$6
       WHERE id=$7 AND customer_id=$8 RETURNING *`,
      [first_name, last_name, title, email, phone, is_primary || false, req.params.contactId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/contacts/:contactId', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM customer_contacts WHERE id=$1 AND customer_id=$2',
      [req.params.contactId, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Win / Loss Reason ─────────────────────────────────────────────────────────

router.put('/:id/win-loss-reason', async (req, res) => {
  const { win_loss_reason } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE customers SET win_loss_reason=$1 WHERE id=$2 RETURNING *',
      [win_loss_reason || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Pre-Meeting Prep ──────────────────────────────────────────────────────────

router.get('/:id/pre-meeting-prep', async (req, res) => {
  try {
    const [
      { rows: [account] },
      { rows: notes },
      { rows: contacts },
      { rows: documents },
      { rows: [emailStats] },
    ] = await Promise.all([
      pool.query(`
        SELECT c.*, sr.name AS owner_name, sr.email AS owner_email,
          c.meddic_data, c.meddic_score,
          CASE WHEN c.stage_entry_date IS NOT NULL THEN (CURRENT_DATE - c.stage_entry_date) ELSE 0 END AS days_in_stage,
          CASE WHEN c.last_contact_date IS NOT NULL THEN (CURRENT_DATE - c.last_contact_date::date) ELSE NULL END AS days_since_contact
        FROM customers c LEFT JOIN sales_reps sr ON c.owner_id = sr.id
        WHERE c.id=$1`, [req.params.id]),
      pool.query(
        'SELECT * FROM customer_notes WHERE customer_id=$1 ORDER BY created_at DESC',
        [req.params.id]),
      pool.query(
        'SELECT * FROM customer_contacts WHERE customer_id=$1 ORDER BY is_primary DESC, first_name ASC',
        [req.params.id]),
      pool.query(
        'SELECT * FROM customer_documents WHERE customer_id=$1 ORDER BY created_at DESC',
        [req.params.id]),
      pool.query(
        'SELECT COUNT(*)::int AS email_count FROM email_logs WHERE customer_id=$1',
        [req.params.id]),
    ]);
    if (!account) return res.status(404).json({ error: 'Not found' });
    res.json({ account, notes, contacts, documents, email_count: emailStats?.email_count || 0, generated_at: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/accounts/:id/pre-meeting-prep/email  — email prep doc to rep
router.post('/:id/pre-meeting-prep/email', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'to email is required' });
  try {
    const [
      { rows: [account] },
      { rows: notes },
      { rows: contacts },
      { rows: documents },
    ] = await Promise.all([
      pool.query(`SELECT c.*, sr.name AS owner_name FROM customers c LEFT JOIN sales_reps sr ON c.owner_id=sr.id WHERE c.id=$1`, [req.params.id]),
      pool.query('SELECT * FROM customer_notes WHERE customer_id=$1 ORDER BY created_at DESC', [req.params.id]),
      pool.query('SELECT * FROM customer_contacts WHERE customer_id=$1 ORDER BY is_primary DESC', [req.params.id]),
      pool.query('SELECT * FROM customer_documents WHERE customer_id=$1 ORDER BY created_at DESC', [req.params.id]),
    ]);
    if (!account) return res.status(404).json({ error: 'Not found' });

    const { getAuthorizedClient } = await import('../auth/gmail.js');
    const { google } = await import('googleapis');
    const auth = await getAuthorizedClient();
    const gmail = google.gmail({ version: 'v1', auth });

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    const contactsHtml = contacts.map(c =>
      `<li>${[c.first_name, c.last_name].filter(Boolean).join(' ')}${c.title ? ` — ${c.title}` : ''}${c.email ? ` &lt;${c.email}&gt;` : ''}</li>`
    ).join('');

    const notesHtml = notes.map(n =>
      `<div style="margin-bottom:16px;padding:12px;border-left:3px solid #6366f1;background:#f8f9fa">
        <div style="font-size:11px;color:#6b7280;margin-bottom:6px">${new Date(n.created_at).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}</div>
        <div>${n.content}</div>
      </div>`
    ).join('');

    const docsHtml = documents.length
      ? `<ul>${documents.map(d => `<li><strong>${d.document_type || 'Document'}</strong>: ${d.file_name} (uploaded ${fmtDate(d.created_at)})</li>`).join('')}</ul>`
      : '<p style="color:#6b7280">No documents attached.</p>';

    const html = `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#1f2937">
  <h1 style="color:#6366f1;border-bottom:2px solid #6366f1;padding-bottom:8px">Pre-Meeting Prep: ${account.company_name}</h1>
  <p style="color:#6b7280;font-size:12px">Generated ${new Date().toLocaleString()}</p>

  <h2>Deal Overview</h2>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:6px 12px;font-weight:bold;width:160px">Stage</td><td style="padding:6px 12px">${account.deal_stage || '—'}</td></tr>
    <tr style="background:#f9fafb"><td style="padding:6px 12px;font-weight:bold">Deal Value</td><td style="padding:6px 12px">${account.deal_value ? `$${Number(account.deal_value).toLocaleString()}` : '—'}</td></tr>
    <tr><td style="padding:6px 12px;font-weight:bold">Expected Close</td><td style="padding:6px 12px">${fmtDate(account.expected_close_date)}</td></tr>
    <tr style="background:#f9fafb"><td style="padding:6px 12px;font-weight:bold">Probability</td><td style="padding:6px 12px">${account.probability != null ? `${account.probability}%` : '—'}</td></tr>
    <tr><td style="padding:6px 12px;font-weight:bold">Account Owner</td><td style="padding:6px 12px">${account.owner_name || '—'}</td></tr>
    <tr style="background:#f9fafb"><td style="padding:6px 12px;font-weight:bold">Industry</td><td style="padding:6px 12px">${account.industry || '—'}</td></tr>
  </table>

  <h2>Key Contacts</h2>
  ${contacts.length ? `<ul>${contactsHtml}</ul>` : '<p style="color:#6b7280">No contacts on record.</p>'}

  <h2>Notes (${notes.length} total, newest first)</h2>
  ${notes.length ? notesHtml : '<p style="color:#6b7280">No notes on record.</p>'}

  <h2>Documents</h2>
  ${docsHtml}
</body></html>`;

    const mime = [
      'MIME-Version: 1.0',
      `To: ${to}`,
      `Subject: Pre-Meeting Prep: ${account.company_name}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      html,
    ].join('\r\n');
    const raw = Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    res.json({ sent: true });
  } catch (err) {
    const status = err.message.includes('not connected') ? 401 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ── Deal Review ───────────────────────────────────────────────────────────────

router.get('/:id/review', async (req, res) => {
  try {
    const [
      { rows: [account] },
      { rows: notes },
      { rows: contacts },
      { rows: history },
      { rows: documents },
    ] = await Promise.all([
      pool.query(`SELECT c.*, c.meddic_data, c.meddic_score, sr.name AS owner_name FROM customers c LEFT JOIN sales_reps sr ON c.owner_id=sr.id WHERE c.id=$1`, [req.params.id]),
      pool.query('SELECT * FROM customer_notes WHERE customer_id=$1 ORDER BY created_at ASC', [req.params.id]),
      pool.query('SELECT * FROM customer_contacts WHERE customer_id=$1 ORDER BY is_primary DESC', [req.params.id]),
      pool.query('SELECT * FROM stage_history WHERE customer_id=$1 ORDER BY entered_at ASC', [req.params.id]),
      pool.query('SELECT * FROM customer_documents WHERE customer_id=$1 ORDER BY created_at DESC', [req.params.id]),
    ]);
    if (!account) return res.status(404).json({ error: 'Not found' });

    // Calculate days in each stage
    const stageTimeline = history.map(h => ({
      ...h,
      days: h.exited_at
        ? Math.round((new Date(h.exited_at) - new Date(h.entered_at)) / 86400000)
        : Math.round((Date.now() - new Date(h.entered_at)) / 86400000),
    }));

    // Total days in deal
    const firstEntry = history[0]?.entered_at;
    const lastExit   = history.at(-1)?.exited_at;
    const total_days = firstEntry
      ? Math.round(((lastExit ? new Date(lastExit) : Date.now()) - new Date(firstEntry)) / 86400000)
      : null;

    res.json({ account, notes, contacts, stageTimeline, documents, total_days, generated_at: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/accounts/:id/review — archive a deal review
router.post('/:id/review', async (req, res) => {
  const { review_data, created_by } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO deal_reviews (customer_id, review_data, created_by) VALUES ($1,$2,$3) RETURNING *',
      [req.params.id, JSON.stringify(review_data), created_by || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
