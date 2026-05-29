import assert from 'node:assert/strict';
import {
  classifyUpstreamHttpError,
  isRetriableUpstreamHttpError,
  normalizeCount,
  normalizeReferenceImages,
  publicImageErrorMessage,
  resolveImageRequestSettings
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

console.log('Unit checks passed.');
