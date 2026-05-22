import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = Number(process.env.PORT || 3001);
const API_BASE_URL = (process.env.SUB2API_BASE_URL || 'http://127.0.0.1:8080/v1').replace(/\/$/, '');
const IMAGE_MODEL = process.env.IMAGE_MODEL || 'gpt-image-2';
const MAX_PROMPT_LENGTH = Number(process.env.MAX_PROMPT_LENGTH || 4000);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 180000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'gallery.sqlite');
const PUBLIC_UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const GALLERY_MAX_IMAGE_WIDTH = Number(process.env.GALLERY_MAX_IMAGE_WIDTH || 1280);
const GALLERY_MAX_IMAGE_HEIGHT = Number(process.env.GALLERY_MAX_IMAGE_HEIGHT || 1280);
const GALLERY_WEBP_QUALITY = Number(process.env.GALLERY_WEBP_QUALITY || 78);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123456';

const ALLOWED_SIZES = new Set([
  '1024x1024',
  '1024x1536',
  '1536x1024',
  'auto'
]);

const ALLOWED_QUALITIES = new Set(['auto', 'low', 'medium', 'high']);
const ALLOWED_FORMATS = new Set(['png', 'jpeg', 'webp']);
const ALLOWED_SORTS = new Set(['hot', 'new']);
const IMAGE_MIME_BY_FORMAT = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp'
};

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_UPLOAD_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS gallery_items (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    image_url TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'png',
    likes INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS gallery_likes (
    item_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (item_id, client_id),
    FOREIGN KEY (item_id) REFERENCES gallery_items(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_gallery_created ON gallery_items(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_gallery_hot ON gallery_items(likes DESC, views DESC, created_at DESC);
`);

const seedCount = db.prepare('SELECT COUNT(*) AS count FROM gallery_items').get().count;
if (seedCount === 0) {
  const seed = db.prepare(`
    INSERT INTO gallery_items (id, prompt, image_url, format, likes, views, created_at)
    VALUES (@id, @prompt, @image_url, @format, @likes, @views, @created_at)
  `);
  const now = Date.now();
  const seeds = [
    ['cyber-cat', '一只赛博朋克风格的橘猫站在霓虹雨夜街头，电影感，超清细节，蓝紫色光影，雨滴反光，35mm 镜头', 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=1200&q=85', 42, 318],
    ['future-city', '未来城市天际线，悬浮飞车穿梭在玻璃摩天楼之间，黄昏金色光线，宏大概念艺术，8k 细节', 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1200&q=85', 36, 276],
    ['fantasy-garden', '梦幻花园里的发光蘑菇和小精灵，柔和散景，童话插画风格，微距，温暖治愈', 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1200&q=85', 31, 242],
    ['luxury-perfume', '一瓶高端香水产品摄影，黑色大理石台面，水滴，奢华广告大片布光，极简高级感', 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1200&q=85', 28, 196],
    ['astronaut-flower', '宇航员坐在月球花园里读书，身边漂浮着发光花瓣，宁静、诗意、电影级构图', 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1200&q=85', 45, 334],
    ['minimal-interior', '极简未来感室内空间，落地窗外是云海，白色曲面家具，自然光，建筑可视化渲染', 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=85', 24, 171],
    ['chinese-dragon', '东方青龙盘旋在云海与山峦之间，水墨与数字艺术融合，金色晨光，史诗氛围', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=85', 39, 287],
    ['coffee-robot', '可爱小机器人在清晨咖啡馆制作拿铁，暖色灯光，皮克斯动画质感，细节丰富', 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=85', 33, 258]
  ];
  for (const [id, prompt, image_url, likes, views] of seeds) {
    seed.run({ id, prompt, image_url, format: 'url', likes, views, created_at: now - Math.floor(Math.random() * 86400000 * 7) });
  }
}

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}));
app.use(cors({ origin: false }));
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  extensions: ['html'],
  maxAge: '1h'
}));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求太频繁，请稍后再试。' }
});

const publishLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '发布太频繁，请稍后再试。' }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, model: IMAGE_MODEL });
});

app.get('/api/admin/verify', (req, res) => {
  const password = req.headers['x-admin-password'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: '管理员密码错误。' });
  }
  res.json({ ok: true });
});

function normalizeApiKey(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizePrompt(value, limit = MAX_PROMPT_LENGTH) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, limit);
}

function pickAllowed(value, allowed, fallback) {
  return typeof value === 'string' && allowed.has(value) ? value : fallback;
}

function normalizeCount(value) {
  const n = Number(value || 1);
  if (!Number.isInteger(n)) return 1;
  return Math.min(Math.max(n, 1), 4);
}

function publicError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function clientId(req) {
  const raw = `${req.ip || ''}|${req.get('user-agent') || ''}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function userIdFromApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return null;
  return crypto.createHash('sha256').update(apiKey.trim()).digest('hex').slice(0, 32);
}

function rowToPublic(row, liked = false) {
  return {
    id: row.id,
    prompt: row.prompt,
    imageUrl: row.image_url,
    format: row.format,
    likes: row.likes,
    views: row.views,
    heat: Number(row.likes) * 5 + Number(row.views),
    createdAt: new Date(row.created_at).toISOString(),
    liked
  };
}

async function saveBase64Image(dataUrlOrBase64, format) {
  const cleanFormat = pickAllowed(format, ALLOWED_FORMATS, 'png');
  let base64 = String(dataUrlOrBase64 || '');
  const match = base64.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (match) {
    base64 = match[2];
    format = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
  } else {
    format = cleanFormat;
  }

  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(base64) || base64.length < 100) {
    throw publicError(400, '图片数据无效，无法发布。');
  }

  const buf = Buffer.from(base64.replace(/\s/g, ''), 'base64');
  if (buf.length < 100 || buf.length > 18 * 1024 * 1024) {
    throw publicError(400, '图片大小不符合发布要求。');
  }

  let optimized;
  try {
    optimized = await sharp(buf, { limitInputPixels: 36_000_000 })
      .rotate()
      .resize({
        width: GALLERY_MAX_IMAGE_WIDTH,
        height: GALLERY_MAX_IMAGE_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: GALLERY_WEBP_QUALITY, effort: 4 })
      .toBuffer();
  } catch {
    throw publicError(400, '图片压缩失败，请换一张图片重试。');
  }

  if (optimized.length < 100 || optimized.length > 4 * 1024 * 1024) {
    throw publicError(400, '图片压缩后仍然过大，请降低尺寸或质量后再发布。');
  }

  const id = crypto.randomUUID();
  const filename = `${id}.webp`;
  fs.writeFileSync(path.join(PUBLIC_UPLOAD_DIR, filename), optimized);
  return { id, imageUrl: `/uploads/${filename}`, format: 'webp' };
}

app.post('/api/generate-image', limiter, async (req, res) => {
  try {
    const apiKey = normalizeApiKey(req.body?.apiKey);
    const rawPrompt = normalizePrompt(req.body?.prompt);

    if (!apiKey) throw publicError(400, '请输入 API Key。');
    if (!rawPrompt) throw publicError(400, '请输入图片描述。');

    const size = pickAllowed(req.body?.size, ALLOWED_SIZES, '1024x1024');
    const quality = pickAllowed(req.body?.quality, ALLOWED_QUALITIES, 'auto');
    const output_format = pickAllowed(req.body?.format, ALLOWED_FORMATS, 'png');
    const n = normalizeCount(req.body?.n);

    const finalPrompt = `请把下面的用户输入理解为图片创作需求，并直接生成图片。不要输出文字、解释、对话或代码，只生成符合描述的图片。\n\n用户输入：\n${rawPrompt}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const upstreamResp = await fetch(`${API_BASE_URL}/images/generations`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: finalPrompt,
        size,
        quality,
        output_format,
        n
      })
    }).finally(() => clearTimeout(timeout));

    let upstreamData = null;
    const text = await upstreamResp.text();
    try {
      upstreamData = text ? JSON.parse(text) : null;
    } catch {
      upstreamData = null;
    }

    if (!upstreamResp.ok) {
      const detail = upstreamData?.error?.message || upstreamData?.message || '图片生成失败，请检查 API Key 或修改提示词后重试。';
      return res.status(upstreamResp.status === 401 ? 401 : 400).json({ error: detail });
    }

    const images = [];
    for (const item of upstreamData?.data || []) {
      if (typeof item?.url === 'string' && item.url) {
        images.push({ type: 'url', url: item.url, prompt: rawPrompt, format: output_format });
      } else if (typeof item?.b64_json === 'string' && item.b64_json) {
        images.push({ type: 'base64', b64_json: item.b64_json, format: output_format, prompt: rawPrompt });
      }
    }

    if (images.length === 0) {
      return res.status(502).json({ error: '上游没有返回图片，请稍后重试。' });
    }

    // 只返回图片数组，不透传上游原始响应，确保网页不会展示聊天/文本内容。
    res.json({ images });
  } catch (err) {
    console.error('[generate-image] error:', {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
      cause: err?.cause,
      apiBaseUrl: API_BASE_URL
    });
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: '图片生成超时，请稍后重试。' });
    }
    const status = err.status || 500;
    res.status(status).json({ error: status >= 500 ? '服务器错误，请稍后重试。' : err.message });
  }
});

app.get('/api/gallery', (req, res) => {
  const sort = pickAllowed(req.query?.sort, ALLOWED_SORTS, 'hot');
  const limit = Math.min(Math.max(Number(req.query?.limit || 12), 1), 60);
  const offset = Math.max(Number(req.query?.offset || 0), 0);
  const apiKey = normalizeApiKey(req.query?.apiKey || req.headers['x-api-key']);
  const order = sort === 'new'
    ? 'created_at DESC'
    : '(likes * 5 + views) DESC, likes DESC, created_at DESC';
  const rows = db.prepare(`SELECT * FROM gallery_items ORDER BY ${order} LIMIT ? OFFSET ?`).all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) as count FROM gallery_items').get().count;
  
  let likedIds = new Set();
  if (apiKey) {
    const userId = userIdFromApiKey(apiKey);
    if (userId) {
      likedIds = new Set(
        db.prepare('SELECT item_id FROM gallery_likes WHERE client_id = ?').all(userId).map(r => r.item_id)
      );
    }
  }
  
  res.json({ items: rows.map(row => rowToPublic(row, likedIds.has(row.id))), total, hasMore: offset + rows.length < total });
});

app.post('/api/gallery', publishLimiter, async (req, res) => {
  try {
    const apiKey = normalizeApiKey(req.body?.apiKey || req.headers['x-api-key']);
    if (!apiKey) throw publicError(401, '请先输入 API Key 并生成图片后才能发布。');
    
    const userId = userIdFromApiKey(apiKey);
    if (!userId) throw publicError(401, 'API Key 无效。');
    
    const prompt = normalizePrompt(req.body?.prompt, 1200);
    if (!prompt) throw publicError(400, '缺少图片提示词，不能发布。');

    const format = pickAllowed(req.body?.format, ALLOWED_FORMATS, 'png');
    let saved;
    if (typeof req.body?.url === 'string' && /^https?:\/\//i.test(req.body.url)) {
      const normalizedUrl = req.body.url.slice(0, 2000);
      const existing = db.prepare('SELECT * FROM gallery_items WHERE image_url = ? LIMIT 1').get(normalizedUrl);
      if (existing) {
        return res.status(200).json({ item: rowToPublic(existing), duplicate: true });
      }
      saved = { id: crypto.randomUUID(), imageUrl: normalizedUrl, format: 'url' };
    } else {
      saved = await saveBase64Image(req.body?.b64_json || req.body?.image, format);
    }

    const createdAt = Date.now();
    db.prepare(`
      INSERT INTO gallery_items (id, prompt, image_url, format, likes, views, created_at)
      VALUES (?, ?, ?, ?, 0, 0, ?)
    `).run(saved.id, prompt, saved.imageUrl, saved.format, createdAt);

    const row = db.prepare('SELECT * FROM gallery_items WHERE id = ?').get(saved.id);
    res.status(201).json({ item: rowToPublic(row), duplicate: false });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: status >= 500 ? '发布失败，请稍后重试。' : err.message });
  }
});

app.post('/api/gallery/:id/like', rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }), (req, res) => {
  try {
    const id = String(req.params.id || '').slice(0, 80);
    const item = db.prepare('SELECT * FROM gallery_items WHERE id = ?').get(id);
    if (!item) throw publicError(404, '作品不存在。');

    const apiKey = normalizeApiKey(req.body?.apiKey || req.headers['x-api-key']);
    if (!apiKey) throw publicError(401, '请先输入 API Key 并生成图片后才能点赞。');
    
    const userId = userIdFromApiKey(apiKey);
    if (!userId) throw publicError(401, 'API Key 无效。');

    const now = Date.now();
    const existing = db.prepare('SELECT 1 FROM gallery_likes WHERE item_id = ? AND client_id = ?').get(id, userId);
    
    let liked;
    if (existing) {
      // 已点赞，执行取消点赞
      db.prepare('DELETE FROM gallery_likes WHERE item_id = ? AND client_id = ?').run(id, userId);
      db.prepare('UPDATE gallery_items SET likes = likes - 1 WHERE id = ?').run(id);
      liked = false;
    } else {
      // 未点赞，执行点赞
      db.prepare('INSERT INTO gallery_likes (item_id, client_id, created_at) VALUES (?, ?, ?)').run(id, userId, now);
      db.prepare('UPDATE gallery_items SET likes = likes + 1 WHERE id = ?').run(id);
      liked = true;
    }
    
    const row = db.prepare('SELECT * FROM gallery_items WHERE id = ?').get(id);
    res.json({ item: rowToPublic(row, liked), liked, likes: row.likes });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: status >= 500 ? '点赞失败，请稍后重试。' : err.message });
  }
});

app.post('/api/gallery/:id/view', (req, res) => {
  const id = String(req.params.id || '').slice(0, 80);
  db.prepare('UPDATE gallery_items SET views = views + 1 WHERE id = ?').run(id);
  const row = db.prepare('SELECT * FROM gallery_items WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '作品不存在。' });
  
  const cid = clientId(req);
  const liked = db.prepare('SELECT 1 FROM gallery_likes WHERE item_id = ? AND client_id = ?').get(id, cid) !== undefined;
  
  res.json({ item: rowToPublic(row, liked) });
});

app.delete('/api/gallery/:id', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }), (req, res) => {
  try {
    const password = req.body?.password || req.headers['x-admin-password'];
    if (password !== ADMIN_PASSWORD) {
      return res.status(403).json({ error: '管理员密码错误。' });
    }
    
    const id = String(req.params.id || '').slice(0, 80);
    const item = db.prepare('SELECT * FROM gallery_items WHERE id = ?').get(id);
    if (!item) {
      return res.status(404).json({ error: '作品不存在。' });
    }
    
    // 删除数据库记录（级联删除点赞记录）
    db.prepare('DELETE FROM gallery_items WHERE id = ?').run(id);
    
    // 删除图片文件（如果是本地上传的）
    if (item.image_url && item.image_url.startsWith('/uploads/')) {
      const filename = path.basename(item.image_url);
      const filepath = path.join(PUBLIC_UPLOAD_DIR, filename);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    }
    
    res.json({ success: true, message: '删除成功。' });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: status >= 500 ? '删除失败，请稍后重试。' : err.message });
  }
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AI image web listening on 0.0.0.0:${PORT}`);
  console.log(`Sub2API upstream: ${API_BASE_URL}`);
  console.log(`Image model: ${IMAGE_MODEL}`);
  console.log(`Gallery database: ${DB_PATH}`);
});
