import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import pool from '../db.js';

const __dir = dirname(fileURLToPath(import.meta.url));
// UPLOAD_DIR env var lets you point at a Railway Volume mount (e.g. /data/uploads)
// to persist files across deploys. Falls back to the local uploads directory.
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(__dir, '../uploads/documents');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'text/plain', 'text/csv',
]);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const ext = extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error(`File type ${file.mimetype} not allowed`));
  },
});

const router = Router({ mergeParams: true });

// GET /api/accounts/:id/documents
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM customer_documents WHERE customer_id=$1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/accounts/:id/documents
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { document_type, deal_stage, uploaded_by, description } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO customer_documents
        (customer_id, file_name, file_path, file_size, mime_type, document_type, deal_stage, uploaded_by, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        req.params.id,
        req.file.originalname,
        req.file.filename,
        req.file.size,
        req.file.mimetype,
        document_type || null,
        deal_stage || null,
        uploaded_by || null,
        description || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    // clean up orphaned file
    try { unlinkSync(join(UPLOAD_DIR, req.file.filename)); } catch {}
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/accounts/:id/documents/:docId
router.delete('/:docId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM customer_documents WHERE id=$1 AND customer_id=$2 RETURNING file_path',
      [req.params.docId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    try { unlinkSync(join(UPLOAD_DIR, rows[0].file_path)); } catch {}
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/accounts/:id/documents/:docId/download
router.get('/:docId/download', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM customer_documents WHERE id=$1 AND customer_id=$2',
      [req.params.docId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const doc = rows[0];
    const filePath = join(UPLOAD_DIR, doc.file_path);
    res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.sendFile(filePath);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/accounts/:id/documents/:docId/preview
router.get('/:docId/preview', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM customer_documents WHERE id=$1 AND customer_id=$2',
      [req.params.docId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const doc = rows[0];
    const filePath = join(UPLOAD_DIR, doc.file_path);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.sendFile(filePath);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
