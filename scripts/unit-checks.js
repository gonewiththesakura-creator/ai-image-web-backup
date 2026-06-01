import assert from 'node:assert/strict';
import {
  classifyUpstreamHttpError,
  isRetriableUpstreamHttpError,
  normalizeCount,
  normalizeMediaModel,
  normalizeMediaImageSizeForModel,
  normalizeMediaImageQualityForModel,
  summarizeMediaImageSuccess,
  publicMediaErrorMessage,
  extractMediaImages,
  normalizeReferenceImages,
  publicImageErrorMessage,
  resolveImageRequestSettings,
  MEDIA_IMAGE_MODELS,
  MEDIA_VIDEO_MODELS,
  MEDIA_IMAGE_PRICING,
  MEDIA_VIDEO_PRICING,
  calculateMediaImagePrice,
  calculateMediaVideoPrice,
  normalizeMediaVideoDuration,
  normalizeMediaVideoSize,
  buildMediaImageUpstreamRequest
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
const generationRequest = await buildMediaImageUpstreamRequest({ model: 'qwen-image', prompt: 'p', size: '1024x1024', quality: 'low', output_format: 'png', n: 1, references: [] });
assert.equal(generationRequest.path, '/images/generations', 'media image without references should use generations endpoint');
assert.equal(generationRequest.referenceMode, false, 'media image without references should not be marked reference mode');
const editRequest = await buildMediaImageUpstreamRequest({ model: 'qwen-image', prompt: 'p', size: '1024x1024', quality: 'low', output_format: 'png', n: 1, references: normalizedRefs });
assert.equal(editRequest.path, '/images/edits', 'media image with references should use edits endpoint');
assert.equal(editRequest.referenceMode, true, 'media image with references should be marked reference mode');
assert.ok(editRequest.body instanceof FormData, 'media image references should be sent as multipart form data');

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

const expectedImageModels = ['gpt-image-1', 'gpt-image-2', 'gpt-image-2-all'];
const expectedVideoModels = [
  'doubao-seedance-1-0-pro-fast-251015',
  'doubao-seedance-1-0-pro-250528',
  'doubao-seedance-1-5-pro-251215',
  'doubao-seedance-2-0-fast-260128',
  'doubao-seedance-2-0-260128',
  'grok-video-3'
];
const enabledImages = MEDIA_IMAGE_MODELS.filter((item) => item.enabled).map((item) => item.id);
const enabledVideos = MEDIA_VIDEO_MODELS.filter((item) => item.enabled).map((item) => item.id);
assert.deepEqual(enabledImages, expectedImageModels, 'all verified working image models should be enabled and exposed in a stable order');
assert.deepEqual(enabledVideos, expectedVideoModels, 'all verified working video models should be enabled and exposed in a stable order');
for (const id of ['gpt-image-1', 'gpt-image-2', 'gpt-image-2-all']) {
  assert.equal(MEDIA_IMAGE_MODELS.find((item) => item.id === id)?.supportsReferenceImages, true, `${id} should advertise media reference-image support`);
}
const expectedFirstFrameVideoModels = new Set([
  'doubao-seedance-1-0-pro-fast-251015',
  'doubao-seedance-1-0-pro-250528'
]);
for (const item of expectedVideoModels.map((id) => MEDIA_VIDEO_MODELS.find((model) => model.id === id))) {
  assert.equal(Boolean(item?.supportsFirstFrame), expectedFirstFrameVideoModels.has(item?.id), `${item?.id} first-frame support flag should match verified rollout scope`);
  assert.equal(Boolean(item?.supportsLastFrame), false, `${item?.id} should not advertise unverified last-frame video support`);
}
for (const item of [...MEDIA_IMAGE_MODELS, ...MEDIA_VIDEO_MODELS]) {
  const publicCopy = `${item.name} ${item.note}`.toLowerCase();
  assert.equal(/t8|t8star|ai\.t8star/.test(publicCopy), false, `public media model copy must not leak upstream brand for ${item.id}`);
}
for (const id of expectedImageModels) {
  assert.ok(MEDIA_IMAGE_PRICING[id]?.base > 0, `${id} must have image pricing`);
  assert.equal(normalizeMediaModel(id, 'image'), id, `${id} should normalize to itself while enabled`);
}
for (const id of expectedVideoModels) {
  assert.ok(MEDIA_VIDEO_PRICING[id], `${id} must have video pricing`);
  assert.equal(normalizeMediaModel(id, 'video'), id, `${id} should normalize to itself while enabled`);
}
assert.equal(calculateMediaImagePrice('gpt-image-1', '1024x1024', 'low', 1), 0.40, 'gpt-image-1 1K anchor price should be 0.4 Dream points');
assert.equal(calculateMediaImagePrice('gpt-image-1', '2048x2048', 'auto', 1), 0.80, 'gpt-image-1 2K should scale from the 0.4 anchor');
assert.equal(calculateMediaImagePrice('gpt-image-2', '1024x1024', 'low', 1), 0.40, 'flagship image2 1K anchor price should be 0.4 Dream points');
assert.equal(calculateMediaImagePrice('gpt-image-2', '2048x2048', 'high', 1), 0.80, 'flagship image2 2K anchor price should be 0.8 Dream points and ignore high quality labels');
assert.equal(calculateMediaImagePrice('gpt-image-2-all', '3840x3840', 'auto', 1), 1.20, 'gpt-image-2-all 4K should scale from the 0.4 anchor');
assert.deepEqual(calculateMediaVideoPrice('doubao-seedance-1-0-pro-fast-251015', 5), { hold: 1, price: 1, unit: 'second', seconds: 5, rate: 0.2 }, 'seedance fast 5s should bill by selected duration');
assert.deepEqual(calculateMediaVideoPrice('doubao-seedance-1-0-pro-fast-251015', 10), { hold: 2, price: 2, unit: 'second', seconds: 10, rate: 0.2 }, 'seedance fast 10s should bill double 5s');
assert.deepEqual(calculateMediaVideoPrice('doubao-seedance-1-0-pro-250528', 10), { hold: 4, price: 4, unit: 'second', seconds: 10, rate: 0.4 }, 'seedance 1 pro should bill 10s by selected duration');
assert.deepEqual(calculateMediaVideoPrice('doubao-seedance-1-5-pro-251215', 10), { hold: 4, price: 4, unit: 'second', seconds: 10, rate: 0.4 }, 'seedance 1.5 pro should bill 10s by selected duration');
assert.deepEqual(calculateMediaVideoPrice('doubao-seedance-2-0-fast-260128', 5), { hold: 8, price: 8, unit: 'second', seconds: 5, rate: 1.6 }, 'seedance 2 fast 5s should use separate high-cost pricing');
assert.deepEqual(calculateMediaVideoPrice('doubao-seedance-2-0-fast-260128', 10), { hold: 16, price: 16, unit: 'second', seconds: 10, rate: 1.6 }, 'seedance 2 fast 10s should not be sold at 2s cost');
assert.deepEqual(calculateMediaVideoPrice('doubao-seedance-2-0-260128', 5), { hold: 9, price: 9, unit: 'second', seconds: 5, rate: 1.8 }, 'seedance 2 pro should use separate high-cost pricing');
assert.deepEqual(calculateMediaVideoPrice('grok-video-3', 5), { hold: 2, price: 2, unit: 'request', seconds: null, rate: 2 }, 'grok video should use fixed 2 point price because Seedance already covers 1 point entry tier');
assert.equal(normalizeMediaVideoDuration(6, 'doubao-seedance-1-0-pro-fast-251015'), 10, 'video duration selector should snap to 5s/10s billing buckets');

assert.equal(normalizeMediaImageSizeForModel('dall-e-3', '2048x2048'), '1024x1024', 'dall-e-3 should never receive unsupported square 2K size');
assert.equal(normalizeMediaImageSizeForModel('dall-e-3', '1152x2048'), '1024x1792', 'dall-e-3 portrait should map to supported portrait size');
assert.equal(normalizeMediaImageSizeForModel('dall-e-3', '2048x1152'), '1792x1024', 'dall-e-3 landscape should map to supported landscape size');
assert.equal(normalizeMediaImageQualityForModel('dall-e-3', 'low'), 'standard', 'dall-e-3 should use supported quality names');
assert.equal(publicMediaErrorMessage(400, "size must be one of 1024x1024, 1024x1792 or 1792x1024 for dall-e-3"), '当前模型不支持所选尺寸，已按模型支持范围调整，请重新提交。', 'dall-e-3 size errors should be short and actionable');
assert.equal(publicMediaErrorMessage(502, 'openai_error'), '上游暂时没有返回可用结果，请稍后重试或换一个模型。', 'openai_error should not leak raw provider code');
assert.equal(publicMediaErrorMessage(502, '当前分组上游负载已饱和，请稍后再试：size must be one of 1024x1024, 1024x1792 or 1792x1024 for dall-e-3 (request id: abc)'), '当前模型不支持所选尺寸，已按模型支持范围调整，请重新提交。', 'mixed saturation and size detail should be classified as size error');
assert.equal(summarizeMediaImageSuccess({ cost: null, billing: { charged: 0.41 }, images: [{}], usage: { total_tokens: 4190 } }), '图片生成完成，已扣费 0.41 点，已返回 1 张图片。', 'success summary should hide verbose usage JSON and upstream cost');
assert.deepEqual(extractMediaImages({ data: [{ revised_prompt: 'only text' }], usage: { total_tokens: 12 } }, 'png', 'p'), [], 'text-only upstream responses must not be treated as successful images');

console.log('Unit checks passed.');
