import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.SUB2API_DATABASE_URL });
const client = await pool.connect();
try {
  const r = await client.query(`
    SELECT k.key
    FROM api_keys k
    WHERE k.id='774'
    LIMIT 1`);
  console.log(r.rows[0]?.key || '');
} finally { client.release(); await pool.end(); }
