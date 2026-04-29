// Run all database migrations in order.
// Usage: node backend/scripts/migrate.js
// Or via npm: npm run db:migrate (from project root)

import 'dotenv/config';
import pool from '../db.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR    = join(__dirname, '../db');

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

async function run() {
  const client = await pool.connect();
  try {
    for (const file of MIGRATIONS) {
      const path = join(DB_DIR, file);
      const sql  = readFileSync(path, 'utf8');
      process.stdout.write(`  running ${file}... `);
      await client.query(sql);
      console.log('✓');
    }
    console.log('\nAll migrations complete.');
  } catch (err) {
    console.error('\nMigration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
