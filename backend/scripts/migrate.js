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
  'migrate_rep_ids.sql',
];

async function run() {
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
      if (rows.length > 0) {
        console.log(`  skipped (already applied): ${file}`);
        continue;
      }
      const sql = readFileSync(join(DB_DIR, file), 'utf8');
      process.stdout.write(`  running ${file}... `);
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
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
