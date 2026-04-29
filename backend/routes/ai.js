import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import rateLimit from 'express-rate-limit';
import pool from '../db.js';
import { calcMeddicScore } from './meddic.js';

const router = Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => `ai_${req.user.id}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

const TOOLS = [
  {
    name: 'search_accounts',
    description: 'Search or list CRM accounts. Returns company name, deal stage, deal value, close date, owner, and MEDDIC score.',
    input_schema: {
      type: 'object',
      properties: {
        query:    { type: 'string',  description: 'Company name search string (partial match)' },
        stage:    { type: 'string',  description: 'Filter by exact deal stage' },
        industry: { type: 'string',  description: 'Filter by industry' },
        limit:    { type: 'number',  description: 'Max results (default 10, max 50)' },
      },
    },
  },
  {
    name: 'get_account',
    description: 'Get full details for an account by ID or company name, including MEDDIC data and recent notes.',
    input_schema: {
      type: 'object',
      properties: {
        id:           { type: 'number', description: 'Account ID (use when known)' },
        company_name: { type: 'string', description: 'Company name partial match (fallback if no ID)' },
      },
    },
  },
  {
    name: 'create_account',
    description: 'Create a new account in the CRM. Only call AFTER the user explicitly confirms.',
    input_schema: {
      type: 'object',
      required: ['company_name'],
      properties: {
        company_name:        { type: 'string' },
        industry:            { type: 'string' },
        deal_value:          { type: 'number', description: 'Deal value in USD' },
        deal_stage:          { type: 'string', description: 'Prospecting | Qualification | Discovery | Demo | Negotiation | POC Planned | POC Active' },
        expected_close_date: { type: 'string', description: 'YYYY-MM-DD format' },
        probability:         { type: 'number', description: 'One of: 10, 25, 50, 75, 90, 100' },
      },
    },
  },
  {
    name: 'update_account',
    description: 'Update deal fields on an existing account. Only call AFTER the user explicitly confirms.',
    input_schema: {
      type: 'object',
      required: ['id'],
      properties: {
        id:                  { type: 'number' },
        deal_stage:          { type: 'string' },
        deal_value:          { type: 'number' },
        expected_close_date: { type: 'string', description: 'YYYY-MM-DD' },
        probability:         { type: 'number' },
        industry:            { type: 'string' },
      },
    },
  },
  {
    name: 'add_note',
    description: 'Add a note to an account. Only call AFTER the user explicitly confirms.',
    input_schema: {
      type: 'object',
      required: ['account_id', 'content'],
      properties: {
        account_id: { type: 'number' },
        content:    { type: 'string' },
      },
    },
  },
  {
    name: 'get_notes',
    description: 'Get recent notes for an account.',
    input_schema: {
      type: 'object',
      required: ['account_id'],
      properties: {
        account_id: { type: 'number' },
        limit:      { type: 'number', description: 'Max notes to return (default 5)' },
      },
    },
  },
  {
    name: 'get_pipeline_summary',
    description: 'Get pipeline totals grouped by deal stage, including deal counts and values.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_metrics',
    description: 'Get overall CRM metrics: active deals, pipeline value, won revenue, and average MEDDIC score.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Schedule a meeting or calendar event. Only call AFTER the user explicitly confirms.',
    input_schema: {
      type: 'object',
      required: ['title', 'start_time', 'end_time'],
      properties: {
        title:       { type: 'string' },
        start_time:  { type: 'string', description: 'ISO 8601 datetime (e.g. 2026-05-10T14:00:00)' },
        end_time:    { type: 'string', description: 'ISO 8601 datetime' },
        customer_id: { type: 'number', description: 'Linked account ID (optional)' },
        description: { type: 'string' },
        location:    { type: 'string' },
      },
    },
  },
  {
    name: 'get_calendar_events',
    description: 'Get upcoming calendar events for the current user.',
    input_schema: {
      type: 'object',
      properties: {
        days_ahead: { type: 'number', description: 'How many days ahead to look (default 7)' },
      },
    },
  },
  {
    name: 'update_meddic',
    description: 'Update MEDDIC qualification data for an account. Merges with existing data. Only call AFTER the user explicitly confirms.',
    input_schema: {
      type: 'object',
      required: ['account_id'],
      properties: {
        account_id:        { type: 'number' },
        metrics:           { type: 'object', properties: { business_impact: { type: 'string' }, roi_estimate: { type: 'string' }, success_metrics: { type: 'string' } } },
        economic_buyer:    { type: 'object', properties: { name: { type: 'string' }, title: { type: 'string' }, contacted: { type: 'boolean' }, accessible: { type: 'boolean' } } },
        decision_criteria: { type: 'object', properties: { technical_criteria: { type: 'string' }, business_criteria: { type: 'string' }, formal_rfp: { type: 'boolean' } } },
        decision_process:  { type: 'object', properties: { process_steps: { type: 'string' }, timeline: { type: 'string' }, next_formal_step: { type: 'string' }, stakeholders: { type: 'string' } } },
        identify_pain:     { type: 'object', properties: { primary_pain: { type: 'string' }, pain_impact: { type: 'string' }, urgency_reason: { type: 'string' }, pain_priority: { type: 'string' } } },
        champion:          { type: 'object', properties: { name: { type: 'string' }, title: { type: 'string' }, engaged: { type: 'boolean' }, access_power: { type: 'boolean' }, selling_internally: { type: 'boolean' } } },
      },
    },
  },
  {
    name: 'navigate',
    description: 'Navigate the CRM to a different view or account detail page.',
    input_schema: {
      type: 'object',
      required: ['view'],
      properties: {
        view:       { type: 'string', description: 'dashboard | customers | pipeline | metrics | analytics | calendar | admin' },
        account_id: { type: 'number', description: 'Account ID if navigating to account detail' },
      },
    },
  },
];

async function executeTool(name, input, user) {
  const isSalesRep = user.role === 'sales_rep';

  switch (name) {
    case 'search_accounts': {
      const { query, stage, industry, limit = 10 } = input;
      const conds = ['1=1'];
      const vals = [];
      if (isSalesRep)  { vals.push(user.rep_id);      conds.push(`c.owner_id=$${vals.length}`); }
      if (query)       { vals.push(`%${query}%`);     conds.push(`c.company_name ILIKE $${vals.length}`); }
      if (stage)       { vals.push(stage);            conds.push(`c.deal_stage=$${vals.length}`); }
      if (industry)    { vals.push(industry);         conds.push(`c.industry ILIKE $${vals.length}`); }
      vals.push(Math.min(Number(limit) || 10, 50));
      const { rows } = await pool.query(
        `SELECT c.id, c.company_name, c.deal_stage, c.deal_value, c.expected_close_date,
                c.probability, c.meddic_score, sr.name AS owner_name
         FROM customers c LEFT JOIN sales_reps sr ON c.owner_id = sr.id
         WHERE ${conds.join(' AND ')} ORDER BY c.company_name LIMIT $${vals.length}`,
        vals
      );
      return { accounts: rows, count: rows.length };
    }

    case 'get_account': {
      const { id, company_name } = input;
      const conds = [];
      const vals = [];
      if (id)          { vals.push(id);               conds.push(`c.id=$${vals.length}`); }
      else if (company_name) { vals.push(`%${company_name}%`); conds.push(`c.company_name ILIKE $${vals.length}`); }
      if (isSalesRep)  { vals.push(user.rep_id);      conds.push(`c.owner_id=$${vals.length}`); }
      if (!conds.length) return { error: 'Provide id or company_name' };
      const { rows } = await pool.query(
        `SELECT c.*, sr.name AS owner_name FROM customers c
         LEFT JOIN sales_reps sr ON c.owner_id=sr.id
         WHERE ${conds.join(' AND ')} LIMIT 1`,
        vals
      );
      if (!rows.length) return { error: 'Account not found' };
      const { rows: notes } = await pool.query(
        'SELECT content, created_at FROM customer_notes WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 3',
        [rows[0].id]
      );
      return { account: rows[0], recent_notes: notes };
    }

    case 'create_account': {
      const { company_name, industry, deal_value, deal_stage, expected_close_date, probability } = input;
      const { rows } = await pool.query(
        `INSERT INTO customers (company_name, industry, deal_value, deal_stage, expected_close_date, probability, owner_id, stage_entry_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE) RETURNING id, company_name, deal_stage`,
        [company_name, industry || null, deal_value || null, deal_stage || 'Prospecting',
         expected_close_date || null, probability || null, user.rep_id || null]
      );
      await logAI(user.id, 'create_account', 'customer', String(rows[0].id));
      return { created: rows[0] };
    }

    case 'update_account': {
      const { id, deal_stage, deal_value, expected_close_date, probability, industry } = input;
      if (isSalesRep) {
        const { rows: own } = await pool.query('SELECT owner_id FROM customers WHERE id=$1', [id]);
        if (!own.length) return { error: 'Not found' };
        if (own[0].owner_id !== user.rep_id) return { error: 'Forbidden — not your account' };
      }
      const { rows: ex } = await pool.query('SELECT * FROM customers WHERE id=$1', [id]);
      if (!ex.length) return { error: 'Not found' };
      const c = ex[0];
      const { rows } = await pool.query(
        `UPDATE customers SET deal_stage=$1, deal_value=$2, expected_close_date=$3, probability=$4, industry=$5
         WHERE id=$6 RETURNING id, company_name, deal_stage, deal_value, expected_close_date, probability`,
        [deal_stage ?? c.deal_stage, deal_value ?? c.deal_value, expected_close_date ?? c.expected_close_date,
         probability ?? c.probability, industry ?? c.industry, id]
      );
      await logAI(user.id, 'update_account', 'customer', String(id));
      return { updated: rows[0] };
    }

    case 'add_note': {
      const { account_id, content } = input;
      if (isSalesRep) {
        const { rows: own } = await pool.query('SELECT owner_id FROM customers WHERE id=$1', [account_id]);
        if (!own.length || own[0].owner_id !== user.rep_id) return { error: 'Forbidden' };
      }
      const { rows } = await pool.query(
        'INSERT INTO customer_notes (customer_id, content) VALUES ($1,$2) RETURNING id, created_at',
        [account_id, content]
      );
      await logAI(user.id, 'add_note', 'customer_note', String(rows[0].id));
      return { note: rows[0], success: true };
    }

    case 'get_notes': {
      const { account_id, limit = 5 } = input;
      const { rows } = await pool.query(
        'SELECT content, created_at FROM customer_notes WHERE customer_id=$1 ORDER BY created_at DESC LIMIT $2',
        [account_id, Math.min(Number(limit) || 5, 20)]
      );
      return { notes: rows };
    }

    case 'get_pipeline_summary': {
      const filter = isSalesRep ? 'WHERE owner_id=$1' : '';
      const vals = isSalesRep ? [user.rep_id] : [];
      const { rows } = await pool.query(
        `SELECT deal_stage, COUNT(*)::int AS count,
                COALESCE(SUM(deal_value),0)::numeric AS total_value
         FROM customers ${filter}
         GROUP BY deal_stage
         ORDER BY MIN(CASE deal_stage
           WHEN 'Prospecting' THEN 1 WHEN 'Qualification' THEN 2 WHEN 'Discovery' THEN 3
           WHEN 'Demo' THEN 4 WHEN 'Negotiation' THEN 5 WHEN 'POC Planned' THEN 6
           WHEN 'POC Active' THEN 7 WHEN 'Closed-Won' THEN 8 WHEN 'Closed-Lost' THEN 9
           ELSE 10 END)`,
        vals
      );
      const active = rows.filter(r => !['Closed-Won','Closed-Lost','Post-Sale'].includes(r.deal_stage));
      return { stages: rows, total_active_pipeline: active.reduce((s, r) => s + Number(r.total_value), 0) };
    }

    case 'get_metrics': {
      const filter = isSalesRep ? 'WHERE owner_id=$1' : '';
      const vals = isSalesRep ? [user.rep_id] : [];
      const { rows: [m] } = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE deal_stage NOT IN ('Closed-Won','Closed-Lost','Post-Sale'))::int AS active_deals,
           COUNT(*) FILTER (WHERE deal_stage='Closed-Won')::int AS closed_won,
           COALESCE(SUM(deal_value) FILTER (WHERE deal_stage NOT IN ('Closed-Won','Closed-Lost','Post-Sale')),0)::numeric AS pipeline_value,
           COALESCE(SUM(deal_value) FILTER (WHERE deal_stage='Closed-Won'),0)::numeric AS won_revenue,
           ROUND(AVG(meddic_score) FILTER (WHERE deal_stage NOT IN ('Closed-Won','Closed-Lost','Post-Sale')))::int AS avg_meddic_score
         FROM customers ${filter}`,
        vals
      );
      return { metrics: m };
    }

    case 'create_calendar_event': {
      const { title, start_time, end_time, customer_id, description, location } = input;
      const { rows } = await pool.query(
        `INSERT INTO calendar_events (user_id, customer_id, title, description, start_time, end_time, location, attendees, reminders)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'[]','[{"minutes":15}]') RETURNING id, title, start_time, end_time`,
        [user.id, customer_id || null, title, description || null, start_time, end_time, location || null]
      );
      await logAI(user.id, 'create_event', 'calendar_event', String(rows[0].id));
      return { event: rows[0], success: true };
    }

    case 'get_calendar_events': {
      const { days_ahead = 7 } = input;
      const { rows } = await pool.query(
        `SELECT ce.id, ce.title, ce.start_time, ce.end_time, ce.location, c.company_name
         FROM calendar_events ce
         LEFT JOIN customers c ON ce.customer_id = c.id
         WHERE ce.user_id=$1 AND ce.is_deleted=false
           AND ce.start_time BETWEEN NOW() AND NOW()+$2::interval
         ORDER BY ce.start_time LIMIT 20`,
        [user.id, `${Math.min(Number(days_ahead) || 7, 90)} days`]
      );
      return { events: rows };
    }

    case 'update_meddic': {
      const { account_id, ...dims } = input;
      if (isSalesRep) {
        const { rows: own } = await pool.query('SELECT owner_id FROM customers WHERE id=$1', [account_id]);
        if (!own.length || own[0].owner_id !== user.rep_id) return { error: 'Forbidden' };
      }
      const { rows: ex } = await pool.query('SELECT meddic_data FROM customers WHERE id=$1', [account_id]);
      if (!ex.length) return { error: 'Account not found' };
      const current = ex[0].meddic_data || {};
      const merged = { ...current };
      for (const [key, val] of Object.entries(dims)) {
        if (val && typeof val === 'object') merged[key] = { ...(current[key] || {}), ...val };
      }
      const score = calcMeddicScore(merged);
      await pool.query(
        'UPDATE customers SET meddic_data=$1, meddic_score=$2 WHERE id=$3',
        [JSON.stringify(merged), score, account_id]
      );
      await logAI(user.id, 'update_meddic', 'customer', String(account_id));
      return { success: true, meddic_score: score };
    }

    case 'navigate':
      return { navigate: input };

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function logAI(userId, action, resourceType, resourceId) {
  try {
    await pool.query(
      'INSERT INTO user_activity_log (user_id, action, resource_type, resource_id, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [userId, action, resourceType, resourceId, 'ai-chatbot']
    );
  } catch {}
}

router.post('/chat', chatLimiter, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'AI assistant not configured. Add ANTHROPIC_API_KEY to backend/.env to enable it.',
    });
  }

  const { messages = [], context = {} } = req.body;
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages must be an array' });

  const client = new Anthropic({ apiKey });

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const systemPrompt = `You are an AI assistant embedded in Hextropian CRM, a B2B sales management platform.

Today: ${today}
User: ${req.user.name} (${req.user.role.replace(/_/g, ' ')})
${context.currentAccountName ? `Currently viewing account: ${context.currentAccountName} (ID: ${context.currentAccountId})` : 'Not viewing a specific account.'}

## Capabilities
You can search/create/update accounts, add notes, view pipeline and metrics, schedule meetings, and run MEDDIC discovery.

## Response guidelines
- Be concise and direct
- Use **bold** for company names and important numbers
- Use bullet lists for multiple items
- Format currency as $X,XXX
- For MEDDIC discovery: ask one focused question per turn, acknowledge the answer, then continue

## CRITICAL: Confirmation required before any write operation
Before calling create_account, update_account, add_note, create_calendar_event, or update_meddic:
1. Describe clearly what you are about to do
2. Ask "Shall I proceed?" or "Want me to go ahead?"
3. Only call the mutating tool when the user explicitly confirms with "yes", "go ahead", "do it", "confirm", etc.
4. If this is the user's initial request (not a confirmation), describe the planned action and ask — do NOT execute yet

## MEDDIC coaching
When running MEDDIC discovery for an account, ask one question per dimension at a time. After gathering sufficient information, offer to save it with update_meddic.`;

  try {
    const apiMessages = messages.map(m => ({ role: m.role, content: String(m.content) }));
    let response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages: apiMessages,
    });

    let navigationAction = null;

    for (let round = 0; round < 4 && response.stop_reason === 'tool_use'; round++) {
      const toolBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];

      for (const block of toolBlocks) {
        const result = await executeTool(block.name, block.input, req.user);
        if (result.navigate) navigationAction = result.navigate;
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      }

      response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
        messages: [
          ...apiMessages,
          { role: 'assistant', content: response.content },
          { role: 'user',      content: toolResults },
        ],
      });
    }

    const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    res.json({ reply, navigate: navigationAction });
  } catch (err) {
    console.error('AI chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
