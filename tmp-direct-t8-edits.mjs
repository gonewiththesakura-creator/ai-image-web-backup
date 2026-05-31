import fs from 'node:fs';
import sharp from 'sharp';
const key = fs.readFileSync('/tmp/t8-upstream-key.txt', 'utf8').trim();
const img = await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 220, g: 40, b: 40 } } }).png().toBuffer();
for (const model of ['qwen-image-edit','gpt-image-1','flux-kontext-pro']) {
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', '参考图上游直连测试：保留红色方块构图，把它变成一枚简洁图标。');
  form.append('size', '1024x1024');
  form.append('quality', 'low');
  form.append('output_format', 'png');
  form.append('n', '1');
  form.append('image', new Blob([img], { type: 'image/png' }), 'reference.png');
  const resp = await fetch('https://ai.t8star.org/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  const text = await resp.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (data.data) data.data = data.data.map?.((x) => ({...x, b64_json: x.b64_json ? `[base64 ${x.b64_json.length}]` : x.b64_json, url: x.url ? x.url.slice(0,120) : x.url})) || data.data;
  console.log(JSON.stringify({model,status: resp.status, ok: resp.ok, data}, null, 2));
}
