import { Router } from 'express';
import pool from '../db.js';

const router = Router();

const STAGE_ORDER = ['linkedin_view', 'linkedin_connect', 'email_1', 'phone', 'email_2', 'linkedin_message', 'email_3'];

// GET /api/workqueue/today?repId=X
router.get('/today', async (req, res) => {
  const { repId } = req.query;
  if (!repId) return res.status(400).json({ error: 'repId required' });

  try {
    const { rows } = await pool.query(`
      SELECT
        wq.id AS wq_id,
        wq.contact_id,
        wq.rep_id,
        wq.assigned_date,
        wq.outreach_stage,
        wq.stage_entered_at,
        wq.completed,
        wq.created_at AS queued_at,
        GREATEST(0, (CURRENT_DATE - wq.stage_entered_at::date))::int AS days_in_stage,
        c.first_name, c.last_name, c.email, c.linkedin_url,
        c.company, c.title, c.vertical, c.phone, c.status,
        c.no_interest_reason
      FROM workqueue wq
      JOIN contacts c ON c.id = wq.contact_id
      WHERE wq.rep_id=$1 AND wq.completed=FALSE
      ORDER BY wq.stage_entered_at ASC
    `, [repId]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workqueue/fill — add prospects up to 50 for a rep
router.post('/fill', async (req, res) => {
  const { repId, count = 50 } = req.body;
  if (!repId) return res.status(400).json({ error: 'repId required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // How many are already active for this rep?
    const { rows: [{ current }] } = await client.query(
      `SELECT COUNT(*)::int AS current FROM workqueue WHERE rep_id=$1 AND completed=FALSE`,
      [repId]
    );
    const toAdd = Math.max(0, Math.min(count, 50) - current);

    if (toAdd === 0) {
      await client.query('COMMIT');
      return res.json({ added: 0, current, message: 'Queue is full' });
    }

    // Select new contacts not already in queue: owned contacts first, then unassigned
    const { rows: candidates } = await client.query(
      `SELECT id FROM contacts
       WHERE status='new'
         AND (owner_rep_id = $2 OR owner_rep_id IS NULL)
         AND NOT EXISTS (SELECT 1 FROM workqueue wq WHERE wq.contact_id = contacts.id)
       ORDER BY
         CASE WHEN owner_rep_id = $2 THEN 0 ELSE 1 END,
         COALESCE(assigned_at, created_at) ASC
       LIMIT $1`,
      [toAdd, repId]
    );

    if (candidates.length === 0) {
      await client.query('COMMIT');
      return res.json({ added: 0, current, message: 'No new contacts available' });
    }

    const ids = candidates.map((c) => c.id);

    // Insert into workqueue
    const placeholders = ids.map((_, i) => `($1, $${i + 2})`).join(',');
    await client.query(
      `INSERT INTO workqueue (rep_id, contact_id) VALUES ${placeholders}`,
      [repId, ...ids]
    );

    // Mark contacts as active
    await client.query(
      `UPDATE contacts SET status='active' WHERE id = ANY($1)`,
      [ids]
    );

    await client.query('COMMIT');
    res.json({ added: ids.length, current: current + ids.length, new_count: 50 - current - ids.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/workqueue/advance-stage
router.post('/advance-stage', async (req, res) => {
  const { contactId, repId, notes } = req.body;
  if (!contactId) return res.status(400).json({ error: 'contactId required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [wq] } = await client.query(
      `SELECT * FROM workqueue WHERE contact_id=$1 AND completed=FALSE`,
      [contactId]
    );
    if (!wq) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Workqueue entry not found' }); }

    const currentIdx = STAGE_ORDER.indexOf(wq.outreach_stage);
    const nextStage  = currentIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[currentIdx + 1] : wq.outreach_stage;

    // Log the completed stage
    await client.query(
      `INSERT INTO outreach_history (contact_id, rep_id, stage, notes) VALUES ($1,$2,$3,$4)`,
      [contactId, repId || null, wq.outreach_stage, notes || null]
    );

    // Advance stage
    const { rows: [updated] } = await client.query(
      `UPDATE workqueue SET outreach_stage=$1, stage_entered_at=NOW() WHERE contact_id=$2 RETURNING *`,
      [nextStage, contactId]
    );

    await client.query('COMMIT');
    res.json({ ...updated, days_in_stage: 0, advanced: currentIdx < STAGE_ORDER.length - 1 });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/workqueue/assign — manually assign contact to rep's queue
router.post('/assign', async (req, res) => {
  const { contactId, repId } = req.body;
  if (!contactId || !repId) return res.status(400).json({ error: 'contactId and repId required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query('SELECT id FROM workqueue WHERE contact_id=$1', [contactId]);
    if (existing.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Contact already in queue' }); }

    const { rows: [contact] } = await client.query('SELECT status FROM contacts WHERE id=$1', [contactId]);
    if (!contact) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Contact not found' }); }
    if (contact.status === 'no_interest' || contact.status === 'converted') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Contact is already ${contact.status}` });
    }

    await client.query(
      `INSERT INTO workqueue (contact_id, rep_id) VALUES ($1, $2)`,
      [contactId, repId]
    );
    await client.query(`UPDATE contacts SET status='active' WHERE id=$1 AND status='new'`, [contactId]);

    await client.query('COMMIT');
    res.json({ assigned: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

export default router;
