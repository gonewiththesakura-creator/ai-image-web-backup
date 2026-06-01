import express from 'express';
import crypto from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const app = express();

const PORT = Number(process.env.PORT || 8095);
const UPSTREAM_BASE_URL = String(process.env.UPSTREAM_BASE_URL || '').replace(/\/$/, '');
const UPSTREAM_API_KEY = String(process.env.UPSTREAM_API_KEY || '').trim();
const INTERNAL_PROXY_TOKEN = String(process.env.INTERNAL_PROXY_TOKEN || '').trim();
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 600000);
const MAX_BODY_BYTES = process.env.MAX_BODY_BYTES || '80mb';
const PUBLIC_ERROR_MESSAGE = '媒体服务暂时不可用，请稍后重试。';

if (!UPSTREAM_BASE_URL) {
  console.error('[media-upstream-proxy] missing UPSTREAM_BASE_URL');
  process.exit(1);
}
if (!UPSTREAM_API_KEY) {
  console.error('[media-upstream-proxy] missing UPSTREAM_API_KEY');
  process.exit(1);
}
if (!INTERNAL_PROXY_TOKEN || INTERNAL_PROXY_TOKEN.length < 24) {
  console.error('[media-upstream-proxy] INTERNAL_PROXY_TOKEN must be set and at least 24 chars');
  process.exit(1);
}

const allowedPrefixes = [
  '/v1/images/generations',
  '/v1/images/edits',
  '/v2/videos/generations'
];

function hashShort(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

const HIDDEN_UPSTREAM_HOST_PATTERN = new RegExp('ai\\.' + 't' + '8star\\.org', 'gi');
const HIDDEN_UPSTREAM_BRAND_PATTERN = new RegExp('t' + '8star|t' + '8', 'gi');

function safeText(value) {
  return String(value || '')
    .replace(HIDDEN_UPSTREAM_HOST_PATTERN, 'media-upstream')
    .replace(HIDDEN_UPSTREAM_BRAND_PATTERN, 'media-upstream')
    .replace(/sk-[A-Za-z0-9_\-]{12,}/g, 'sk-***');
}

function isAllowedPath(pathname) {
  return allowedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || '';
}

function requireInternalAuth(req, res, next) {
  const token = String(req.get('x-dreamapi-media-proxy-token') || '');
  const ok = token.length === INTERNAL_PROXY_TOKEN.length
    && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(INTERNAL_PROXY_TOKEN));
  if (!ok) return res.status(403).json({ error: 'Forbidden' });
  return next();
}

app.disable('x-powered-by');
app.set('trust proxy', false);
app.use(express.raw({ type: '*/*', limit: MAX_BODY_BYTES }));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'dreamapi-media-upstream-proxy' });
});

app.use(requireInternalAuth);

app.use(async (req, res) => {
  const started = Date.now();
  const reqId = crypto.randomUUID();
  const pathname = req.path;
  if (!isAllowedPath(pathname)) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = new URL(`${UPSTREAM_BASE_URL}${req.originalUrl}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (['host', 'authorization', 'content-length', 'connection', 'x-dreamapi-media-proxy-token'].includes(lower)) continue;
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  headers.set('authorization', `Bearer ${UPSTREAM_API_KEY}`);
  headers.set('x-request-id', reqId);

  let upstreamResp;
  try {
    upstreamResp = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === 'GET' ? undefined : req.body,
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = err?.name === 'AbortError';
    console.warn('[media-upstream-proxy] upstream fetch failed', {
      reqId,
      method: req.method,
      path: pathname,
      status: aborted ? 504 : 502,
      durationMs: Date.now() - started,
      ipHash: hashShort(getClientIp(req)),
      message: safeText(err?.message)
    });
    return res.status(aborted ? 504 : 502).json({ error: PUBLIC_ERROR_MESSAGE });
  }
  clearTimeout(timeout);

  const contentType = upstreamResp.headers.get('content-type') || '';
  const responseHeadersToCopy = ['content-type', 'cache-control', 'last-modified', 'etag', 'accept-ranges', 'content-range'];
  for (const name of responseHeadersToCopy) {
    const value = upstreamResp.headers.get(name);
    if (value) res.setHeader(name, value);
  }

  const status = upstreamResp.status;
  const elapsed = Date.now() - started;
  console.info('[media-upstream-proxy] request', {
    reqId,
    method: req.method,
    path: pathname,
    status,
    durationMs: elapsed,
    ipHash: hashShort(getClientIp(req))
  });

  if (!upstreamResp.ok) {
    const bodyText = await upstreamResp.text().catch(() => '');
    let body = null;
    try { body = bodyText ? JSON.parse(bodyText) : null; } catch { body = null; }
    const upstreamMessage = safeText(body?.error?.message || body?.message || bodyText).slice(0, 800);
    console.warn('[media-upstream-proxy] upstream non-ok', { reqId, status, path: pathname, upstreamMessage });
    return res.status(status >= 500 ? 502 : status).json({ error: PUBLIC_ERROR_MESSAGE });
  }

  if (/application\/json/i.test(contentType)) {
    const bodyText = await upstreamResp.text();
    const cleaned = safeText(bodyText);
    res.status(status).send(cleaned);
    return;
  }

  const arrayBuffer = await upstreamResp.arrayBuffer();
  res.status(status).send(Buffer.from(arrayBuffer));
});

app.use((err, req, res, next) => {
  console.error('[media-upstream-proxy] unhandled', { message: safeText(err?.message), stack: safeText(err?.stack) });
  res.status(500).json({ error: PUBLIC_ERROR_MESSAGE });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DreamApi media upstream proxy listening on 0.0.0.0:${PORT}`);
  console.log(`Upstream host hash: ${hashShort(UPSTREAM_BASE_URL)}`);
});
