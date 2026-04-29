import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/metrics/pipeline — overall pipeline metrics + per-rep breakdown
router.get('/pipeline', async (req, res) => {
  try {
    const { rows: byStage } = await pool.query(`
      SELECT
        deal_stage,
        COUNT(*)::int                                              AS count,
        COALESCE(SUM(deal_value), 0)                              AS total_value,
        COALESCE(SUM(deal_value * COALESCE(probability,0)/100.0), 0) AS weighted_value,
        ROUND(AVG(probability))::int                              AS avg_probability
      FROM customers
      GROUP BY deal_stage
      ORDER BY deal_stage
    `);

    const { rows: byRep } = await pool.query(`
      SELECT
        sr.id                                                             AS rep_id,
        sr.name                                                           AS rep_name,
        COUNT(c.id)::int                                                  AS account_count,
        COALESCE(SUM(c.deal_value), 0)                                   AS total_value,
        COALESCE(SUM(c.deal_value * COALESCE(c.probability,0)/100.0), 0) AS weighted_value
      FROM sales_reps sr
      LEFT JOIN customers c ON c.owner_id = sr.id
      GROUP BY sr.id, sr.name
      ORDER BY sr.name
    `);

    const { rows: [totals] } = await pool.query(`
      SELECT
        COUNT(*)::int                                                          AS total_accounts,
        COALESCE(SUM(deal_value), 0)                                          AS total_pipeline,
        COALESCE(SUM(CASE WHEN deal_stage = 'Closed-Won' THEN deal_value END), 0) AS won_revenue,
        COALESCE(SUM(CASE WHEN deal_stage NOT IN ('Closed-Won','Closed-Lost','Post-Sale')
                     THEN deal_value END), 0)                                 AS active_pipeline,
        COALESCE(SUM(deal_value * COALESCE(probability,0)/100.0), 0)          AS weighted_pipeline,
        MIN(expected_close_date)                                               AS earliest_close,
        MAX(expected_close_date)                                               AS latest_close,
        ROUND(AVG(expected_close_date - CURRENT_DATE))::int                   AS avg_days_to_close
      FROM customers
      WHERE deal_stage NOT IN ('Closed-Won','Closed-Lost','Post-Sale')
    `);

    res.json({ totals, byStage, byRep });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/metrics/rep/:repId — detail metrics for one rep
router.get('/rep/:repId', async (req, res) => {
  try {
    const { rows: [rep] } = await pool.query('SELECT * FROM sales_reps WHERE id=$1', [req.params.repId]);
    if (!rep) return res.status(404).json({ error: 'Rep not found' });

    const { rows: accounts } = await pool.query(`
      SELECT *,
        CASE WHEN stage_entry_date IS NOT NULL THEN (CURRENT_DATE - stage_entry_date) ELSE 0 END AS days_in_stage,
        CASE WHEN deal_value IS NOT NULL AND probability IS NOT NULL
          THEN deal_value * probability / 100.0 ELSE NULL END AS weighted_value
      FROM customers
      WHERE owner_id = $1
      ORDER BY company_name
    `, [req.params.repId]);

    const { rows: byStage } = await pool.query(`
      SELECT
        deal_stage,
        COUNT(*)::int                                                    AS count,
        COALESCE(SUM(deal_value), 0)                                    AS total_value,
        COALESCE(SUM(deal_value * COALESCE(probability,0)/100.0), 0)   AS weighted_value
      FROM customers
      WHERE owner_id = $1
      GROUP BY deal_stage
      ORDER BY deal_stage
    `, [req.params.repId]);

    const { rows: [totals] } = await pool.query(`
      SELECT
        COUNT(*)::int                                                    AS account_count,
        COALESCE(SUM(deal_value), 0)                                    AS total_pipeline,
        COALESCE(SUM(deal_value * COALESCE(probability,0)/100.0), 0)   AS weighted_value,
        ROUND(AVG(probability))::int                                     AS avg_probability,
        MIN(expected_close_date)                                         AS earliest_close,
        MAX(expected_close_date)                                         AS latest_close
      FROM customers
      WHERE owner_id = $1
    `, [req.params.repId]);

    res.json({ rep, accounts, byStage, totals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/metrics/stage-times (also mounted at /api/analytics/stage-times)
router.get('/stage-times', async (req, res) => {
  try {
    // Average days per stage — all deals
    const { rows: allStages } = await pool.query(`
      SELECT
        to_stage                                                                                AS stage,
        COUNT(*)::int                                                                           AS sample_count,
        ROUND(AVG(
          EXTRACT(EPOCH FROM (COALESCE(exited_at, NOW()) - entered_at)) / 86400
        ))::int                                                                                AS avg_days,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (COALESCE(exited_at, NOW()) - entered_at)) / 86400
        ))::int                                                                                AS median_days
      FROM stage_history
      GROUP BY to_stage
      ORDER BY avg_days DESC NULLS LAST
    `);

    // Average days per stage — won deals only
    const { rows: wonStages } = await pool.query(`
      SELECT
        sh.to_stage                                                                            AS stage,
        COUNT(*)::int                                                                          AS sample_count,
        ROUND(AVG(
          EXTRACT(EPOCH FROM (COALESCE(sh.exited_at, NOW()) - sh.entered_at)) / 86400
        ))::int                                                                               AS avg_days,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (COALESCE(sh.exited_at, NOW()) - sh.entered_at)) / 86400
        ))::int                                                                               AS median_days
      FROM stage_history sh
      JOIN customers c ON sh.customer_id = c.id
      WHERE c.deal_stage = 'Closed-Won'
      GROUP BY sh.to_stage
      ORDER BY avg_days DESC NULLS LAST
    `);

    // Average time to close: from first stage entry to Closed-Won entry
    const { rows: [closeTimes] } = await pool.query(`
      SELECT
        COUNT(*)::int AS won_deals,
        ROUND(AVG(
          EXTRACT(EPOCH FROM (sh_won.entered_at - sh_first.entered_at)) / 86400
        ))::int AS avg_days_to_close,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (sh_won.entered_at - sh_first.entered_at)) / 86400
        ))::int AS median_days_to_close
      FROM customers c
      JOIN stage_history sh_first ON sh_first.customer_id = c.id AND sh_first.from_stage IS NULL
      JOIN stage_history sh_won   ON sh_won.customer_id   = c.id AND sh_won.to_stage = 'Closed-Won'
      WHERE c.deal_stage = 'Closed-Won'
    `);

    res.json({ allStages, wonStages, closeTimes: closeTimes || { won_deals: 0, avg_days_to_close: null, median_days_to_close: null } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/metrics/prospecting — prospecting engine metrics
router.get('/prospecting', async (req, res) => {
  try {
    const { rows: [totals] } = await pool.query(`
      SELECT
        COUNT(*)::int                                                                  AS total_contacts,
        COALESCE(SUM(CASE WHEN status='new'         THEN 1 ELSE 0 END), 0)::int    AS new_contacts,
        COALESCE(SUM(CASE WHEN status='active'      THEN 1 ELSE 0 END), 0)::int    AS active_contacts,
        COALESCE(SUM(CASE WHEN status='no_interest' THEN 1 ELSE 0 END), 0)::int    AS no_interest_contacts,
        COALESCE(SUM(CASE WHEN status='converted'   THEN 1 ELSE 0 END), 0)::int    AS converted_contacts
      FROM contacts
    `);

    const { rows: [queueStats] } = await pool.query(`
      SELECT
        COUNT(*)::int                                                      AS active_in_queue,
        COUNT(DISTINCT rep_id)::int                                        AS active_reps
      FROM workqueue WHERE completed=FALSE
    `);

    // Conversion funnel by outreach stage
    const { rows: funnel } = await pool.query(`
      SELECT stage, COUNT(*)::int AS count
      FROM outreach_history
      GROUP BY stage
      ORDER BY
        CASE stage
          WHEN 'linkedin_view'    THEN 1
          WHEN 'linkedin_connect' THEN 2
          WHEN 'email_1'          THEN 3
          WHEN 'phone'            THEN 4
          WHEN 'email_2'          THEN 5
          WHEN 'linkedin_message' THEN 6
          WHEN 'email_3'          THEN 7
          WHEN 'converted'        THEN 8
          WHEN 'no_interest'      THEN 9
          ELSE 10
        END
    `);

    // By vertical breakdown
    const { rows: byVertical } = await pool.query(`
      SELECT
        COALESCE(vertical, 'Unknown')                                      AS vertical,
        COUNT(*)::int                                                      AS total,
        SUM(CASE WHEN status='converted'   THEN 1 ELSE 0 END)::int        AS converted,
        SUM(CASE WHEN status='no_interest' THEN 1 ELSE 0 END)::int        AS no_interest,
        SUM(CASE WHEN status IN('new','active') THEN 1 ELSE 0 END)::int   AS available
      FROM contacts
      GROUP BY COALESCE(vertical, 'Unknown')
      ORDER BY total DESC
    `);

    // Rep productivity
    const { rows: byRep } = await pool.query(`
      SELECT
        sr.id AS rep_id,
        sr.name AS rep_name,
        COUNT(wq.id)::int                                                  AS queued,
        COUNT(CASE WHEN c.status='converted'   THEN 1 END)::int           AS converted,
        COUNT(CASE WHEN c.status='no_interest' THEN 1 END)::int           AS no_interest,
        COUNT(CASE WHEN wq.completed=FALSE      THEN 1 END)::int          AS active
      FROM sales_reps sr
      LEFT JOIN workqueue wq ON wq.rep_id = sr.id
      LEFT JOIN contacts c   ON c.id = wq.contact_id
      GROUP BY sr.id, sr.name
      ORDER BY queued DESC
    `);

    // Average days from queue entry to conversion
    const { rows: [timing] } = await pool.query(`
      SELECT
        ROUND(AVG(
          EXTRACT(EPOCH FROM (oh.completed_at - wq.created_at)) / 86400
        ))::int AS avg_days_to_convert
      FROM outreach_history oh
      JOIN workqueue wq ON wq.contact_id = oh.contact_id
      WHERE oh.stage = 'converted'
    `);

    res.json({
      totals: { ...totals, ...queueStats },
      funnel,
      byVertical,
      byRep,
      timing: timing || { avg_days_to_convert: null },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
