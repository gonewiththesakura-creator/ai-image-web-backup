import assert from 'node:assert/strict';
import {
  classifyUpstreamHttpError,
  isRetriableUpstreamHttpError,
  normalizeCount,
  publicImageErrorMessage
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

console.log('Unit checks passed.');
