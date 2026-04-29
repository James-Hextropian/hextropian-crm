import { Router } from 'express';
import pool from '../db.js';

const router = Router();

export function calcMeddicScore(data = {}) {
  const m  = data.metrics           || {};
  const eb = data.economic_buyer    || {};
  const dc = data.decision_criteria || {};
  const dp = data.decision_process  || {};
  const ip = data.identify_pain     || {};
  const c  = data.champion          || {};

  const scores = [
    !m.business_impact ? 0 : (m.roi_estimate && m.success_metrics ? 2 : 1),
    !eb.name           ? 0 : (eb.contacted && eb.accessible       ? 2 : 1),
    (!dc.technical_criteria && !dc.business_criteria) ? 0 : (dc.technical_criteria && dc.business_criteria ? 2 : 1),
    !dp.process_steps  ? 0 : (dp.timeline && dp.next_formal_step  ? 2 : 1),
    !ip.primary_pain   ? 0 : (ip.pain_impact && ip.urgency_reason ? 2 : 1),
    !c.name            ? 0 : (c.engaged && c.access_power         ? 2 : 1),
  ];
  return Math.round(scores.reduce((a, b) => a + b, 0) / 12 * 100);
}

// GET /api/meddic/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const isRepFiltered = req.user.role === 'sales_rep';
    const values = isRepFiltered ? [req.user.rep_id] : [];
    const filter = isRepFiltered ? 'AND c.owner_id=$1' : '';

    const { rows: deals } = await pool.query(
      `SELECT c.id, c.company_name, c.deal_stage, c.deal_value, c.meddic_data, c.meddic_score,
              c.owner_id, sr.name AS owner_name
       FROM customers c
       LEFT JOIN sales_reps sr ON c.owner_id = sr.id
       WHERE c.deal_stage NOT IN ('Closed-Won','Closed-Lost','Post-Sale') ${filter}
       ORDER BY c.meddic_score ASC`,
      values
    );

    const dims = ['metrics', 'economic_buyer', 'decision_criteria', 'decision_process', 'identify_pain', 'champion'];
    const dimCounts = Object.fromEntries(dims.map(d => [d, 0]));

    for (const deal of deals) {
      const md = deal.meddic_data || {};
      if (md.metrics?.business_impact)                                                          dimCounts.metrics++;
      if (md.economic_buyer?.name)                                                              dimCounts.economic_buyer++;
      if (md.decision_criteria?.technical_criteria || md.decision_criteria?.business_criteria) dimCounts.decision_criteria++;
      if (md.decision_process?.process_steps)                                                   dimCounts.decision_process++;
      if (md.identify_pain?.primary_pain)                                                       dimCounts.identify_pain++;
      if (md.champion?.name)                                                                    dimCounts.champion++;
    }

    const total = deals.length || 1;
    const dimCompletion = Object.fromEntries(
      Object.entries(dimCounts).map(([k, v]) => [k, Math.round(v / total * 100)])
    );

    const repMap = {};
    for (const deal of deals) {
      const key = deal.owner_id ?? 'unassigned';
      if (!repMap[key]) repMap[key] = { name: deal.owner_name || 'Unassigned', count: 0, totalScore: 0 };
      repMap[key].count++;
      repMap[key].totalScore += deal.meddic_score || 0;
    }
    const byRep = Object.values(repMap)
      .map(r => ({ name: r.name, count: r.count, avgScore: Math.round(r.totalScore / r.count) }))
      .sort((a, b) => b.avgScore - a.avgScore);

    const avgScore = deals.length
      ? Math.round(deals.reduce((s, d) => s + (d.meddic_score || 0), 0) / deals.length) : 0;

    res.json({ avgScore, totalDeals: deals.length, bottomDeals: deals.slice(0, 8), byRep, dimCompletion });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/meddic/:customerId
router.get('/:customerId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT meddic_data, meddic_score FROM customers WHERE id=$1', [req.params.customerId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/meddic/:customerId
router.put('/:customerId', async (req, res) => {
  const { meddic_data } = req.body;
  if (!meddic_data || typeof meddic_data !== 'object') {
    return res.status(400).json({ error: 'meddic_data object is required' });
  }
  try {
    if (req.user.role === 'sales_rep') {
      const { rows } = await pool.query('SELECT owner_id FROM customers WHERE id=$1', [req.params.customerId]);
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      if (rows[0].owner_id !== req.user.rep_id) return res.status(403).json({ error: 'Forbidden' });
    }
    const score = calcMeddicScore(meddic_data);
    const { rows } = await pool.query(
      'UPDATE customers SET meddic_data=$1, meddic_score=$2 WHERE id=$3 RETURNING meddic_data, meddic_score',
      [JSON.stringify(meddic_data), score, req.params.customerId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
