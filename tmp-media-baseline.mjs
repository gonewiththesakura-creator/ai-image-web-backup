import pg from 'pg';
import Database from 'better-sqlite3';
const pool = new pg.Pool({ connectionString: process.env.SUB2API_DATABASE_URL });
const client = await pool.connect();
try {
  const r = await client.query(`
    SELECT k.id AS key_id, k.name AS key_name, k.user_id, k.group_id, k.quota_used,
           u.balance, g.name AS group_name
    FROM api_keys k
    LEFT JOIN users u ON u.id=k.user_id
    LEFT JOIN groups g ON g.id=k.group_id
    WHERE k.id='781'
    LIMIT 1`);
  const base = r.rows[0] || null;
  console.log('MEDIA_KEY_BASELINE', JSON.stringify(base));
  const usage = await client.query(`SELECT id, request_id, model, total_cost, actual_cost, image_count, image_size, request_type, inbound_endpoint, upstream_endpoint, upstream_model, requested_model, created_at FROM usage_logs WHERE api_key_id='781' ORDER BY id DESC LIMIT 10`);
  console.log('MEDIA_KEY_RECENT_USAGE', JSON.stringify(usage.rows));
  const entries = await client.query(`SELECT id, user_id, api_key_id, applied, delta_usd, created_at, usage_log_id FROM billing_usage_entries WHERE api_key_id='781' ORDER BY id DESC LIMIT 10`);
  console.log('MEDIA_KEY_RECENT_BILLING', JSON.stringify(entries.rows));
} finally { client.release(); await pool.end(); }
const db = new Database('/app/data/gallery.sqlite');
const events = db.prepare(`SELECT id, event_type, task_type, model, amount, upstream_cost, usage_log_id, billing_entry_id, created_at, metadata_json FROM media_billing_events ORDER BY rowid DESC LIMIT 10`).all();
console.log('LOCAL_EVENTS', JSON.stringify(events));
