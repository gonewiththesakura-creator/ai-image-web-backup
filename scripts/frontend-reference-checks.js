import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

assert.match(html, /function mergeReferenceImages\(/, 'frontend should merge newly selected reference files with existing references');
assert.match(html, /const availableSlots = Math\.max\(0, 3 - referenceImages\.length\)/, 'merge should calculate remaining slots from existing references');
assert.doesNotMatch(html, /referenceImages\s*=\s*\[\];\s*\n\s*for \(const file of picked\)/, 'selecting new files must not clear existing reference images before appending');
assert.match(html, /data-ref-add/, 'reference preview should include an add-more tile after at least one image');
assert.match(html, /referenceInput\.click\(\)/, 'add-more tile should reopen the file picker');
assert.match(html, /canvas\.toDataURL\('image\/jpeg', quality\)/, 'frontend should encode uploaded reference images as JPEG before submit');
assert.match(html, /const tryQualities = \[0\.78, 0\.68, 0\.58\]/, 'frontend should retry lower JPEG qualities when references are still large');
assert.match(html, /compressedImages\.push\(await fileToCompressedDataUrl\(file\)\)/, 'frontend must submit compressed reference data URLs, not original FileReader output');
assert.doesNotMatch(html, /referenceImages\.push\(reader\.result\)|referenceImages\s*=\s*referenceImages\.concat\(reader\.result\)/, 'frontend must not submit raw uncompressed FileReader data URLs');
assert.match(html, /4K（最长边 3840px，约 2-5 分钟）/, 'frontend should explain 4K as 3840px longest edge and set latency expectation');
assert.match(html, /2K（最长边 2048px）/, 'frontend should explain 2K as 2048px longest edge');
assert.match(html, /1K（最长边 1024px）/, 'frontend should explain 1K as 1024px longest edge');
assert.match(html, /720P（快速预览）/, 'frontend should avoid implying 720P is exact 720 pixels');
assert.doesNotMatch(html, /src=\"scripts\/mobile-chat-layout-checks\.js\"/, 'mobile chat layout check script should not be loaded by the public page');

console.log('Frontend reference-image checks passed.');
