import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// GET /api/reps
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM sales_reps ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reps
router.post('/', async (req, res) => {
  const { name, email } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO sales_reps (name, email) VALUES ($1, $2) RETURNING *',
      [name.trim(), email || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/reps/:id
router.put('/:id', async (req, res) => {
  const { name, email } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const { rows } = await pool.query(
      'UPDATE sales_reps SET name=$1, email=$2 WHERE id=$3 RETURNING *',
      [name.trim(), email || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/reps/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM sales_reps WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
