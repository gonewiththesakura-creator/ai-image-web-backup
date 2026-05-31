import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.SUB2API_DATABASE_URL });
const client = await pool.connect();
try {
  const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='accounts' ORDER BY ordinal_position`);
  console.log('COLS', cols.rows.map(r=>r.column_name).join(','));
  const r = await client.query(`SELECT * FROM accounts WHERE id::text='51' OR name ~* 't8|media|star|贞' ORDER BY id::int`);
  console.log(JSON.stringify(r.rows.map((row)=>{ const x={...row}; if ('key' in x) {x.key_len=String(x.key||'').length; x.key_prefix=String(x.key||'').slice(0,10); x.key_suffix=String(x.key||'').slice(-4); delete x.key;} if ('api_key' in x) {x.api_key_len=String(x.api_key||'').length; x.api_key_prefix=String(x.api_key||'').slice(0,10); x.api_key_suffix=String(x.api_key||'').slice(-4); delete x.api_key;} return x;}), null, 2));
} finally { client.release(); await pool.end(); }
