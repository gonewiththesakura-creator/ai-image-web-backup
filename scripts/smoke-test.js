import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
const TEST_API_KEY = process.env.TEST_API_KEY || process.env.DREAMAPI_TEST_API_KEY || '';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const resp = await fetch(`${url}/health`);
      if (resp.ok) return;
    } catch {}
    await delay(1000);
  }
  throw new Error(`Server not ready within ${timeoutMs}ms: ${url}`);
}

async function postJson(path, body) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await resp.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { resp, data };
}

async function run() {
  await waitForServer(BASE_URL);

  const health = await fetch(`${BASE_URL}/health`).then((r) => r.json());
  assert.equal(health.ok, true, 'health.ok should be true');

  const missingFingerprint = await postJson('/api/generate-image', {
    prompt: 'test prompt',
    size: '1024x1024',
    quality: 'auto',
    outputMode: 'standard',
    n: 1,
    format: 'png'
  });
  assert.equal(missingFingerprint.resp.status, 403, 'free trial without fingerprint should return 403');

  if (!TEST_API_KEY) {
    console.log('Smoke checks passed (skipped live generation because TEST_API_KEY is not set).');
    return;
  }

  const single = await postJson('/api/generate-image', {
    apiKey: TEST_API_KEY,
    prompt: '一个极简风格的蓝色马克杯产品摄影，纯色背景，光线干净',
    size: '1024x1024',
    quality: 'medium',
    outputMode: '2k',
    n: 1,
    format: 'png'
  });
  assert.equal(single.resp.ok, true, `single generation failed: ${JSON.stringify(single.data)}`);
  assert.ok(Array.isArray(single.data.images) && single.data.images.length >= 1, 'single generation should return images');

  const batch = await Promise.allSettled([
    postJson('/api/generate-image', {
      apiKey: TEST_API_KEY,
      prompt: '一台银色未来感相机，产品摄影，工作室光线',
      size: '1536x1024',
      quality: 'medium',
      outputMode: 'standard',
      n: 1,
      format: 'jpeg'
    }),
    postJson('/api/generate-image', {
      apiKey: TEST_API_KEY,
      prompt: '一台银色未来感相机，产品摄影，工作室光线',
      size: '1536x1024',
      quality: 'medium',
      outputMode: 'standard',
      n: 1,
      format: 'jpeg'
    })
  ]);

  const successes = batch.filter((item) => item.status === 'fulfilled' && item.value.resp.ok);
  assert.ok(successes.length >= 1, 'at least one batch generation should succeed');

  console.log(`Smoke checks passed (batch successes: ${successes.length}/${batch.length}).`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
