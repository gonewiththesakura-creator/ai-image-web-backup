import fs from 'node:fs';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.SUB2API_DATABASE_URL });
const client = await pool.connect();
try {
  const r = await client.query(`
    SELECT k.key
    FROM api_keys k
    WHERE k.id='781'
    LIMIT 1`);
  fs.writeFileSync('/tmp/media-key.txt', r.rows[0]?.key || '');
  console.log('wrote_key_len', String(r.rows[0]?.key || '').length);
} finally { client.release(); await pool.end(); }
