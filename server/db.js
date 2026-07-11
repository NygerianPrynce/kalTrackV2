import pg from 'pg'

const { Pool } = pg

// Neon needs SSL. connectionString carries sslmode=require; enforce here too.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
})

// Small helper: run a query, return rows.
export async function q(text, params = []) {
  const res = await pool.query(text, params)
  return res.rows
}

// Return first row or null.
export async function one(text, params = []) {
  const rows = await q(text, params)
  return rows[0] || null
}
