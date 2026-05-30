import assert from 'node:assert/strict';
import {
  classifyUpstreamHttpError,
  isRetriableUpstreamHttpError,
  normalizeCount,
  normalizeMediaModel,
  normalizeReferenceImages,
  publicImageErrorMessage,
  resolveImageRequestSettings,
  MEDIA_IMAGE_MODELS,
  MEDIA_VIDEO_MODELS,
  MEDIA_IMAGE_PRICING,
  MEDIA_VIDEO_PRICING,
  calculateMediaImagePrice,
  calculateMediaVideoPrice
} from '../src/server.js';

assert.equal(normalizeCount(4), 1, 'server should force one upstream image per request');
assert.equal(normalizeCount('3'), 1, 'string batch count should still be forced to one');
assert.equal(normalizeCount(0), 1, 'invalid batch count should fall back to one');

const streamError = classifyUpstreamHttpError(502, {
  error: { message: 'stream error: stream ID 7; INTERNAL_ERROR; received from peer' }
});
assert.equal(streamError.retriable, true, '502 stream error should be retriable once');
assert.equal(isRetriableUpstreamHttpError(streamError), true, 'classifier result should be accepted by retry guard');

const authError = classifyUpstreamHttpError(401, { error: { message: 'invalid api key' } });
assert.equal(authError.retriable, false, '401 must not be retried');
assert.match(publicImageErrorMessage(401, 'invalid api key'), /API Key/, '401 message should guide customer to key/permission');

const trialError = publicImageErrorMessage(403, '体验额度已用完，请注册获取 API Key');
assert.match(trialError, /体验额度已用完/, 'trial quota message should stay specific');

const timeoutMessage = publicImageErrorMessage(504, 'upstream timeout');
assert.match(timeoutMessage, /超时/, '504 should mention timeout');

const tinyPng = `data:image/png;base64,${Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
    <rect width="24" height="24" fill="#f8d8b8"/>
    <circle cx="12" cy="12" r="7" fill="#8b5cf6"/>
  </svg>
`).toString('base64')}`;
const normalizedRefs = await normalizeReferenceImages([tinyPng]);
assert.equal(normalizedRefs.length, 1, 'server should keep one normalized reference image');
assert.equal(normalizedRefs[0].type, 'image/jpeg', 'server should convert reference images to JPEG before upstream submit');
assert.equal(normalizedRefs[0].filename, 'reference-1.jpg', 'server should submit a .jpg filename upstream');
assert.ok(Buffer.isBuffer(normalizedRefs[0].buffer), 'server should submit a binary buffer');
assert.ok(normalizedRefs[0].buffer.length > 100, 'compressed reference buffer should not be empty');
assert.ok(normalizedRefs[0].buffer.length <= 900 * 1024, 'server should keep small references within compression target');

assert.equal(resolveImageRequestSettings({ size: '1024x1024', outputMode: '720p' }).finalSize, '1024x1024', '720P/standard should request base 1:1 size');
assert.equal(resolveImageRequestSettings({ size: '1024x1024', outputMode: '1k' }).finalSize, '1024x1024', '1K should request 1024 longest-edge 1:1 size');
assert.equal(resolveImageRequestSettings({ size: '1024x1024', outputMode: '2k' }).finalSize, '2048x2048', '2K 1:1 should request 2048x2048 upstream');
assert.equal(resolveImageRequestSettings({ size: '1024x1024', outputMode: '4k' }).finalSize, '3840x3840', '4K 1:1 should stay within upstream 3840 longest-edge limit');
assert.equal(resolveImageRequestSettings({ size: '2048x1152', outputMode: '1k' }).finalSize, '1024x1024', '1K 16:9 should avoid upstream minimum-pixel-budget rejection');
assert.equal(resolveImageRequestSettings({ size: '1152x2048', outputMode: '1k' }).finalSize, '1024x1024', '1K 9:16 should avoid upstream minimum-pixel-budget rejection');
assert.equal(resolveImageRequestSettings({ size: '1536x1152', outputMode: '1k' }).finalSize, '1024x1024', '1K 4:3 should avoid upstream minimum-pixel-budget rejection');
assert.equal(resolveImageRequestSettings({ size: '2048x1152', outputMode: '4k' }).finalSize, '3840x2160', '4K 16:9 should stay within upstream 3840 longest-edge limit');
assert.equal(resolveImageRequestSettings({ size: '1152x2048', outputMode: '4k' }).finalSize, '2160x3840', '4K 9:16 should stay within upstream 3840 longest-edge limit');
assert.equal(resolveImageRequestSettings({ size: '2048x1152', outputMode: '2k' }).finalSize, '2048x1152', '2K 16:9 should keep 2048 longest-edge upstream');
assert.equal(resolveImageRequestSettings({ size: '1536x1152', outputMode: '4k', hasReferenceImages: true }).finalSize, '1024x1024', 'reference image mode should still force safe 1024x1024');
assert.equal(resolveImageRequestSettings({ size: '4096x4096', outputMode: '4k', usingTrial: true }).finalSize, '1024x1024', 'trial mode should keep free default size');

const expectedImageModels = ['qwen-image', 'gpt-image-1', 'gpt-image-1-mini', 'flux-schnell', 'dall-e-3', 'gpt-image-2', 'nano-banana', 'flux-kontext-pro', 'flux-kontext-max', 'grok-4.1-image'];
const expectedVideoModels = [
  'wanx2.1-t2v-turbo',
  'wanx2.1-t2v-plus',
  'wan2.2-t2v-plus',
  'wan2.5-t2v-preview',
  'wan2.6-t2v',
  'MiniMax-Hailuo-02',
  'MiniMax-Hailuo-2.3',
  'T2V-01',
  'sdols-2.0-fast',
  'sdols-2.0',
  'doubao-seedance-1-0-pro-fast-251015',
  'doubao-seedance-2-0-fast-260128',
  'doubao-seedance-2-0-260128',
  'veo3.1-lite',
  'grok-video-3'
];
const enabledImages = MEDIA_IMAGE_MODELS.filter((item) => item.enabled).map((item) => item.id);
const enabledVideos = MEDIA_VIDEO_MODELS.filter((item) => item.enabled).map((item) => item.id);
assert.deepEqual(enabledImages, expectedImageModels, 'all verified working image models should be enabled and exposed in a stable order');
assert.deepEqual(enabledVideos, expectedVideoModels, 'all verified working video models should be enabled and exposed in a stable order');
for (const item of [...MEDIA_IMAGE_MODELS, ...MEDIA_VIDEO_MODELS]) {
  const publicCopy = `${item.name} ${item.note}`.toLowerCase();
  assert.equal(/t8|t8star|ai\.t8star/.test(publicCopy), false, `public media model copy must not leak upstream brand for ${item.id}`);
}
for (const id of expectedImageModels) {
  assert.ok(MEDIA_IMAGE_PRICING[id]?.base > 0, `${id} must have image pricing`);
  assert.equal(normalizeMediaModel(id, 'image'), id, `${id} should normalize to itself while enabled`);
}
for (const id of expectedVideoModels) {
  assert.ok(MEDIA_VIDEO_PRICING[id]?.hold > 0, `${id} must have video hold pricing`);
  assert.equal(MEDIA_VIDEO_PRICING[id].hold, MEDIA_VIDEO_PRICING[id].price, `${id} hold and final price should match fixed-price billing`);
  assert.equal(normalizeMediaModel(id, 'video'), id, `${id} should normalize to itself while enabled`);
}
assert.equal(calculateMediaImagePrice('qwen-image', '1024x1024', 'low', 1), 0.3, 'qwen-image low 1K should charge 0.30 DreamApi points');
assert.equal(calculateMediaImagePrice('flux-schnell', '1024x1024', 'low', 1), 0.225, 'flux-schnell low 1K should charge from configured base price');
assert.equal(calculateMediaImagePrice('flux-kontext-max', '1024x1024', 'low', 1), 0.9, 'flux-kontext-max low 1K should charge premium Kontext Max price');
assert.equal(calculateMediaImagePrice('grok-4.1-image', '1024x1024', 'low', 1), 0.9, 'grok image low 1K should charge premium image price');
assert.deepEqual(calculateMediaVideoPrice('wanx2.1-t2v-turbo'), { hold: 3, price: 3 }, 'wan turbo fixed price should stay at 3');
assert.deepEqual(calculateMediaVideoPrice('sdols-2.0-fast'), { hold: 5, price: 5 }, 'sdols fast fixed price should stay at 5');
assert.deepEqual(calculateMediaVideoPrice('doubao-seedance-2-0-260128'), { hold: 10, price: 10 }, 'seedance 2 pro fixed price should stay at 10');

console.log('Unit checks passed.');
