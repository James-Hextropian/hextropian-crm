import { Router } from 'express';
import { google } from 'googleapis';
import { getAuthorizedClient } from '../auth/gmail.js';
import pool from '../db.js';

const router = Router();

function buildRawMessage({ from, to, subject, body }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ];
  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// POST /api/email/send
router.post('/send', async (req, res) => {
  const { customer_id, to, subject, body } = req.body;
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'to, subject, and body are required' });
  }

  try {
    const auth = await getAuthorizedClient();
    const gmail = google.gmail({ version: 'v1', auth });

    // Get sender address from stored tokens
    const { getStoredTokens } = await import('../auth/gmail.js');
    const tokens = getStoredTokens();
    const from = tokens?.email ?? 'me';

    const raw = buildRawMessage({ from, to, subject, body });
    const { data } = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    // Log to DB
    const { rows } = await pool.query(
      `INSERT INTO email_logs (customer_id, to_email, subject, body, gmail_message_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [customer_id || null, to, subject, body, data.id]
    );

    // Update customer's last_contact_date
    if (customer_id) {
      await pool.query(
        'UPDATE customers SET last_contact_date = CURRENT_DATE WHERE id = $1',
        [customer_id]
      );
    }

    res.json(rows[0]);
  } catch (err) {
    const status = err.message.includes('not connected') ? 401 : 500;
    res.status(status).json({ error: err.message });
  }
});

// GET /api/email/history/:customer_id
router.get('/history/:customer_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM email_logs WHERE customer_id = $1 ORDER BY sent_at DESC LIMIT 50`,
      [req.params.customer_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
