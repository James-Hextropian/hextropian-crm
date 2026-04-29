// Usage: node backend/scripts/seed-user.js [email] [password] [name] [role]
// Defaults to: james@hextropian.systems / password123 / James Wright / admin
//
// DATABASE_URL must be set (local .env or pass inline):
//   DATABASE_URL=postgresql://... node backend/scripts/seed-user.js

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from '../db.js';

const email    = process.argv[2] || 'james@hextropian.systems';
const password = process.argv[3] || 'password123';
const name     = process.argv[4] || 'James Wright';
const role     = process.argv[5] || 'admin';

const hash = await bcrypt.hash(password, 12);

const { rows } = await pool.query(
  `INSERT INTO users (email, password_hash, name, role)
   VALUES ($1, $2, $3, $4)
   ON CONFLICT (email) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         name          = EXCLUDED.name,
         role          = EXCLUDED.role,
         updated_at    = NOW()
   RETURNING id, email, name, role`,
  [email, hash, name, role]
);

console.log('User upserted:', rows[0]);
await pool.end();
