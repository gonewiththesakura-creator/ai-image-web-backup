import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

assert.match(html, /function mergeReferenceImages\(/, 'frontend should merge newly selected reference files with existing references');
assert.match(html, /const availableSlots = Math\.max\(0, 3 - referenceImages\.length\)/, 'merge should calculate remaining slots from existing references');
assert.doesNotMatch(html, /referenceImages\s*=\s*\[\];\s*\n\s*for \(const file of picked\)/, 'selecting new files must not clear existing reference images before appending');
assert.match(html, /data-ref-add/, 'reference preview should include an add-more tile after at least one image');
assert.match(html, /referenceInput\.click\(\)/, 'add-more tile should reopen the file picker');

console.log('Frontend reference-image checks passed.');
