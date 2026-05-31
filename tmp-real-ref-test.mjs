import fs from 'node:fs';
import sharp from 'sharp';
const png = await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 220, g: 40, b: 40 } } })
  .png()
  .toBuffer();
const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
const body = {
  model: 'qwen-image',
  prompt: '参考图扣费链路测试：保留红色方块构图，把它变成一枚简洁的 DreamApi 风格图标。',
  size: '1024x1024',
  quality: 'low',
  output_format: 'png',
  n: 1,
  referenceImages: [dataUrl]
};
const key = fs.readFileSync('/tmp/media-key.txt', 'utf8').trim();
const resp = await fetch('http://127.0.0.1:3001/api/media/images/generations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
  body: JSON.stringify(body)
});
const text = await resp.text();
let data;
try { data = JSON.parse(text); } catch { data = { raw: text }; }
const compact = JSON.parse(JSON.stringify(data));
if (compact.images) compact.images = compact.images.map((img) => ({ ...img, b64_json: img.b64_json ? `[base64 ${img.b64_json.length}]` : img.b64_json, url: img.url ? img.url.slice(0, 180) : img.url }));
console.log(JSON.stringify({ status: resp.status, ok: resp.ok, data: compact }, null, 2));
