const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 5,                       // small cap — hosted env, shared pooler
  idleTimeoutMillis: 30_000,    // release idle clients after 30s
  connectionTimeoutMillis: 10_000, // fail fast if pooler is saturated
});

pool.on('error', (err) => {
  console.error('Unexpected idle pg client error', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};
