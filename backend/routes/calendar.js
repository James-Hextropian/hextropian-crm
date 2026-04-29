import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/calendar/events?start=&end=&customerId=
router.get('/events', async (req, res) => {
  const { start, end, customerId } = req.query;

  const conditions = ['is_deleted=false'];
  const values = [];

  // sales_rep sees only their own events; admin/manager see all
  if (req.user.role === 'sales_rep') {
    values.push(req.user.id);
    conditions.push(`ce.user_id=$${values.length}`);
  }

  if (customerId) {
    values.push(customerId);
    conditions.push(`ce.customer_id=$${values.length}`);
  }
  if (start) {
    values.push(start);
    conditions.push(`ce.end_time >= $${values.length}`);
  }
  if (end) {
    values.push(end);
    conditions.push(`ce.start_time <= $${values.length}`);
  }

  try {
    const { rows } = await pool.query(
      `SELECT ce.*, c.company_name, u.name AS organizer_name
       FROM calendar_events ce
       LEFT JOIN customers c ON ce.customer_id = c.id
       LEFT JOIN users u ON ce.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ce.start_time ASC`,
      values
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/calendar/sync — pull events from Google Calendar
router.post('/sync', async (req, res) => {
  try {
    const { rows: [userRow] } = await pool.query('SELECT google_tokens FROM users WHERE id=$1', [req.user.id]);
    if (!userRow?.google_tokens) return res.json({ synced: false, reason: 'not_connected' });
    await syncGoogleCalendar(req.user.id, userRow.google_tokens, null, null);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/calendar/events
router.post('/events', async (req, res) => {
  const { title, description, start_time, end_time, customer_id, attendees, location, reminders } = req.body;
  if (!title?.trim() || !start_time || !end_time) return res.status(400).json({ error: 'title, start_time, end_time are required' });
  if (new Date(start_time) >= new Date(end_time)) return res.status(400).json({ error: 'start_time must be before end_time' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO calendar_events (user_id, customer_id, title, description, start_time, end_time, location, attendees, reminders)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id, customer_id || null, title.trim(), description || null, start_time, end_time,
       location || null, JSON.stringify(attendees || []), JSON.stringify(reminders || [{ minutes: 15 }])]
    );
    const event = rows[0];

    // Push to Google Calendar if user is connected
    try {
      const { rows: [userRow] } = await pool.query('SELECT google_tokens FROM users WHERE id=$1', [req.user.id]);
      if (userRow?.google_tokens) {
        const gEvent = await createGoogleEvent(req.user.id, userRow.google_tokens, event);
        if (gEvent) {
          await pool.query('UPDATE calendar_events SET google_event_id=$1, synced_at=NOW() WHERE id=$2', [gEvent.id, event.id]);
          event.google_event_id = gEvent.id;
        }
      }
    } catch (gErr) { console.warn('Google Calendar push failed:', gErr.message); }

    // Auto-add note to account if linked
    if (customer_id && req.body.add_to_notes) {
      const noteContent = `<strong>Meeting Scheduled:</strong> ${title}<br>When: ${new Date(start_time).toLocaleString()}${description ? `<br>${description}` : ''}`;
      await pool.query('INSERT INTO customer_notes (customer_id, content) VALUES ($1,$2)', [customer_id, noteContent]);
    }

    await logActivity(req.user.id, 'create_event', 'calendar_event', String(event.id), req.ip);
    res.status(201).json(event);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/calendar/events/:id
router.get('/events/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ce.*, c.company_name, u.name AS organizer_name
       FROM calendar_events ce
       LEFT JOIN customers c ON ce.customer_id = c.id
       LEFT JOIN users u ON ce.user_id = u.id
       WHERE ce.id=$1 AND ce.is_deleted=false`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    // sales_rep can only see their own
    if (req.user.role === 'sales_rep' && rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/calendar/events/:id
router.put('/events/:id', async (req, res) => {
  const { title, description, start_time, end_time, customer_id, attendees, location, reminders } = req.body;
  try {
    const { rows: existing } = await pool.query('SELECT * FROM calendar_events WHERE id=$1 AND is_deleted=false', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    if (req.user.role === 'sales_rep' && existing[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(
      `UPDATE calendar_events SET title=$1, description=$2, start_time=$3, end_time=$4, customer_id=$5,
       attendees=$6, location=$7, reminders=$8
       WHERE id=$9 RETURNING *`,
      [title?.trim() || existing[0].title, description ?? existing[0].description,
       start_time || existing[0].start_time, end_time || existing[0].end_time,
       customer_id ?? existing[0].customer_id, JSON.stringify(attendees ?? existing[0].attendees),
       location ?? existing[0].location, JSON.stringify(reminders ?? existing[0].reminders),
       req.params.id]
    );

    // Update Google Calendar if connected
    try {
      if (existing[0].google_event_id) {
        const { rows: [userRow] } = await pool.query('SELECT google_tokens FROM users WHERE id=$1', [req.user.id]);
        if (userRow?.google_tokens) {
          await updateGoogleEvent(req.user.id, userRow.google_tokens, existing[0].google_event_id, rows[0]);
          await pool.query('UPDATE calendar_events SET synced_at=NOW() WHERE id=$1', [req.params.id]);
        }
      }
    } catch (gErr) { console.warn('Google Calendar update failed:', gErr.message); }

    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/calendar/events/:id/notes — post-meeting notes
router.patch('/events/:id/notes', async (req, res) => {
  const { post_meeting_notes, add_to_account } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE calendar_events SET post_meeting_notes=$1 WHERE id=$2 AND is_deleted=false RETURNING *',
      [post_meeting_notes, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    // Optionally auto-create a note on the linked account
    if (add_to_account && rows[0].customer_id && post_meeting_notes?.trim()) {
      const noteContent = `<strong>Post-Meeting Notes — ${rows[0].title}:</strong><br><br>${post_meeting_notes.replace(/\n/g, '<br>')}`;
      await pool.query('INSERT INTO customer_notes (customer_id, content) VALUES ($1,$2)', [rows[0].customer_id, noteContent]);
    }
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/calendar/events/:id
router.delete('/events/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM calendar_events WHERE id=$1 AND is_deleted=false', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (req.user.role === 'sales_rep' && rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    await pool.query('UPDATE calendar_events SET is_deleted=true WHERE id=$1', [req.params.id]);

    // Delete from Google Calendar
    try {
      if (rows[0].google_event_id) {
        const { rows: [userRow] } = await pool.query('SELECT google_tokens FROM users WHERE id=$1', [req.user.id]);
        if (userRow?.google_tokens) {
          await deleteGoogleEvent(req.user.id, userRow.google_tokens, rows[0].google_event_id);
        }
      }
    } catch (gErr) { console.warn('Google Calendar delete failed:', gErr.message); }

    res.status(204).send();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/calendar/status — check if user has Google Calendar connected
router.get('/status', async (req, res) => {
  try {
    const { rows: [user] } = await pool.query('SELECT google_tokens IS NOT NULL AS connected FROM users WHERE id=$1', [req.user.id]);
    res.json({ connected: !!user?.connected });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Google Calendar helpers ──────────────────────────────────────────────────

async function getCalendarClient(userId, tokens) {
  const { google } = await import('googleapis');
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  client.setCredentials(tokens);
  client.on('tokens', async (fresh) => {
    const merged = { ...tokens, ...fresh };
    await pool.query('UPDATE users SET google_tokens=$1 WHERE id=$2', [JSON.stringify(merged), userId]);
  });
  return google.calendar({ version: 'v3', auth: client });
}

async function syncGoogleCalendar(userId, tokens, start, end) {
  const { google } = await import('googleapis');
  const calendar = await getCalendarClient(userId, tokens);

  const params = {
    calendarId: 'primary',
    maxResults: 250,
    singleEvents: true,
    orderBy: 'startTime',
  };
  if (start) params.timeMin = new Date(start).toISOString();
  if (end)   params.timeMax = new Date(end).toISOString();
  if (!start && !end) {
    params.timeMin = new Date(Date.now() - 30 * 86400000).toISOString();
    params.timeMax = new Date(Date.now() + 90 * 86400000).toISOString();
  }

  const { data } = await calendar.events.list(params);
  const gEvents = data.items || [];

  for (const ge of gEvents) {
    if (ge.status === 'cancelled') continue;
    const startTime = ge.start?.dateTime || ge.start?.date;
    const endTime   = ge.end?.dateTime   || ge.end?.date;
    if (!startTime) continue;

    const attendees = (ge.attendees || []).map((a) => ({
      name: a.displayName || '', email: a.email, response_status: a.responseStatus,
    }));

    await pool.query(
      `INSERT INTO calendar_events (user_id, google_event_id, title, description, start_time, end_time, location, attendees, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (google_event_id) WHERE google_event_id IS NOT NULL AND is_deleted=false
       DO UPDATE SET title=$3, description=$4, start_time=$5, end_time=$6, location=$7, attendees=$8, synced_at=NOW()`,
      [userId, ge.id, ge.summary || '(no title)', ge.description || null,
       startTime, endTime, ge.location || null, JSON.stringify(attendees)]
    );
  }

  // Mark locally deleted if removed from Google
  if (gEvents.length > 0) {
    const gIds = gEvents.map((e) => e.id);
    await pool.query(
      `UPDATE calendar_events SET is_deleted=true
       WHERE user_id=$1 AND google_event_id IS NOT NULL AND google_event_id != ALL($2::text[]) AND is_deleted=false`,
      [userId, gIds]
    );
  }
}

async function createGoogleEvent(userId, tokens, event) {
  const calendar = await getCalendarClient(userId, tokens);
  const resource = {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: { dateTime: new Date(event.start_time).toISOString() },
    end:   { dateTime: new Date(event.end_time).toISOString() },
    attendees: (event.attendees || []).map((a) => ({ email: a.email, displayName: a.name })),
    reminders: {
      useDefault: false,
      overrides: (event.reminders || [{ minutes: 15 }]).map((r) => ({ method: 'popup', minutes: r.minutes })),
    },
  };
  const { data } = await calendar.events.insert({ calendarId: 'primary', resource, sendUpdates: 'all' });
  return data;
}

async function updateGoogleEvent(userId, tokens, googleEventId, event) {
  const calendar = await getCalendarClient(userId, tokens);
  await calendar.events.patch({
    calendarId: 'primary',
    eventId: googleEventId,
    resource: {
      summary: event.title,
      description: event.description,
      start: { dateTime: new Date(event.start_time).toISOString() },
      end:   { dateTime: new Date(event.end_time).toISOString() },
    },
  });
}

async function deleteGoogleEvent(userId, tokens, googleEventId) {
  const calendar = await getCalendarClient(userId, tokens);
  await calendar.events.delete({ calendarId: 'primary', eventId: googleEventId });
}

async function logActivity(userId, action, resourceType, resourceId, ip) {
  try {
    await pool.query(
      'INSERT INTO user_activity_log (user_id, action, resource_type, resource_id, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [userId, action, resourceType, resourceId, ip]
    );
  } catch {} // Non-fatal
}

export default router;
