import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.SUB2API_DATABASE_URL });
const client = await pool.connect();
try {
  const r = await client.query(`
    SELECT k.id, k.name, k.user_id, k.group_id, k.quota_used, u.balance, g.name AS group_name, k.key
    FROM api_keys k
    LEFT JOIN users u ON u.id=k.user_id
    LEFT JOIN groups g ON g.id=k.group_id
    WHERE k.user_id='1' AND (g.name ~* 'media|媒体|video|image|9999' OR k.name ~* 'media|媒体|9999|image|video')
    ORDER BY k.id::int DESC
    LIMIT 20`);
  console.log(JSON.stringify(r.rows.map(({key,...x})=>({...x,key_prefix:String(key||'').slice(0,12),key_len:String(key||'').length})), null, 2));
} finally { client.release(); await pool.end(); }
