#!/usr/bin/env node
/**
 * Drops users + password_reset_tokens on DATABASE_URL (app DB) after migrating
 * to AUTH_DATABASE_URL. Does not touch the auth database.
 *
 *   npm run drop:legacy-user-tables
 */
require('dotenv').config();
const { Pool } = require('pg');
const { getDatabaseUrl } = require('../config/database-url');

const url = getDatabaseUrl();
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

async function main() {
  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await pool.query('DROP TABLE IF EXISTS password_reset_tokens CASCADE');
    await pool.query('DROP TABLE IF EXISTS users CASCADE');
    console.log('Dropped password_reset_tokens and users on app DATABASE_URL.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
