import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { requireAuth } from './middleware/auth.js';
import customersRouter  from './routes/customers.js';
import authRouter       from './routes/auth.js';
import emailRouter      from './routes/email.js';
import repsRouter       from './routes/reps.js';
import metricsRouter    from './routes/metrics.js';
import contactsRouter   from './routes/contacts.js';
import workqueueRouter  from './routes/workqueue.js';
import documentsRouter  from './routes/documents.js';
import usersRouter      from './routes/users.js';
import calendarRouter   from './routes/calendar.js';
import meddicRouter     from './routes/meddic.js';
import aiRouter         from './routes/ai.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IS_PROD   = process.env.NODE_ENV === 'production';
const PORT      = process.env.PORT || 3001;

// Fail fast if required secrets are missing
const REQUIRED_ENV = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Set these in Railway dashboard → your service → Variables.');
  process.exit(1);
}
console.log('JWT_SECRET loaded:', !!process.env.JWT_SECRET);

const app = express();

// ── Trust Railway's reverse proxy so req.ip is the real client IP ─────────────
if (IS_PROD) app.set('trust proxy', 1);

// ── Compression (gzip/brotli) for all responses ───────────────────────────────
app.use(compression());

// ── CORS ─────────────────────────────────────────────────────────────────────
// In production the backend serves the frontend from the same origin, so browser
// requests are same-origin and don't trigger CORS. This config covers:
//   • local dev (Vite dev server on :5173)
//   • any external API consumer
const ALLOWED_ORIGINS = (
  process.env.FRONTEND_URL ||
  'http://localhost:5173,https://hextropian-crm-production.up.railway.app'
)
  .split(',')
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
    else cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// ── Rate limit login attempts ─────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Public routes (no auth required) ─────────────────────────────────────────
app.use('/api/auth/login',           loginLimiter);
app.use('/api/auth/forgot-password', loginLimiter);
app.use('/api/auth', authRouter);
app.get('/api/health', (_, res) => res.json({ status: 'ok', env: IS_PROD ? 'production' : 'development' }));

// ── Serve built frontend (public — before auth guard) ─────────────────────────
// The HTML/JS/CSS are publicly accessible; the React app handles its own auth flow.
if (IS_PROD) {
  const DIST = join(__dirname, '../frontend/dist');
  if (existsSync(DIST)) {
    app.use(express.static(DIST, { maxAge: '1y', immutable: true }));
  } else {
    console.warn('⚠  frontend/dist not found — run "npm run build --prefix frontend" first');
  }
}

// ── Auth guard — scoped to /api only so frontend routes are never blocked ──────
app.use('/api', requireAuth);

// ── Document routes (must be before generic /api/customers and /api/accounts) ─
app.use('/api/accounts/:id/documents',  documentsRouter);
app.use('/api/customers/:id/documents', documentsRouter);

// ── Protected routes ──────────────────────────────────────────────────────────
app.use('/api/users',      usersRouter);
app.use('/api/calendar',   calendarRouter);
app.use('/api/customers',  customersRouter);
app.use('/api/accounts',   customersRouter);
app.use('/api/email',      emailRouter);
app.use('/api/reps',       repsRouter);
app.use('/api/metrics',    metricsRouter);
app.use('/api/analytics',  metricsRouter);
app.use('/api/contacts',   contactsRouter);
app.use('/api/workqueue',  workqueueRouter);
app.use('/api/meddic',     meddicRouter);
app.use('/api/ai',         aiRouter);

// ── SPA fallback (after all API routes) ──────────────────────────────────────
// Any non-API request that wasn't matched above gets index.html so React Router
// can handle client-side navigation.
if (IS_PROD) {
  const DIST = join(__dirname, '../frontend/dist');
  if (existsSync(DIST)) {
    app.get('*', (req, res) => res.sendFile(join(DIST, 'index.html')));
  }
}

const MIGRATIONS = [
  'schema.sql',
  'migrate_pipeline.sql',
  'migrate_auth.sql',
  'migrate_email.sql',
  'migrate_calendar.sql',
  'migrate_enablement.sql',
  'migrate_meddic.sql',
  'migrate_prospecting.sql',
  'migrate_lead_assignment.sql',
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    for (const file of MIGRATIONS) {
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1', [file]
      );
      if (rows.length > 0) continue;
      const sql = readFileSync(join(__dirname, 'db', file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      console.log(`  migrated: ${file}`);
    }
    console.log('Migrations complete.');
  } finally {
    client.release();
  }
}

async function start() {
  try {
    await runMigrations();
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  }
  app.listen(PORT, () =>
    console.log(`Hextropian CRM API running on http://localhost:${PORT} [${IS_PROD ? 'production' : 'development'}]`)
  );
}

start();
