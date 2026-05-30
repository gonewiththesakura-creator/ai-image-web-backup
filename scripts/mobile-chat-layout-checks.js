import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

assert.match(html, /@media \(max-width: 980px\)[\s\S]*?\.chat-card\s*\{[\s\S]*?max-height:\s*none;[\s\S]*?overflow:\s*visible;/, 'mobile chat card must not cap height or clip the composer');
assert.match(html, /@media \(max-width: 980px\)[\s\S]*?\.chat-main\s*\{[\s\S]*?min-height:\s*auto;[\s\S]*?max-height:\s*none;/, 'mobile chat main should use natural height so the page can scroll to the input');
assert.match(html, /@media \(max-width: 980px\)[\s\S]*?\.chat-messages\s*\{[\s\S]*?min-height:\s*120px;[\s\S]*?max-height:\s*none;/, 'mobile chat messages should stay compact so the composer is easy to find');
assert.match(html, /@media \(max-width: 980px\)[\s\S]*?\.chat-session-actions\s*\{[\s\S]*?grid-template-columns:\s*1fr 1fr;/, 'mobile chat session actions should be compact');
assert.match(html, /@media \(max-width: 980px\)[\s\S]*?\.chat-composer textarea\s*\{[\s\S]*?min-height:\s*118px;/, 'mobile chat input should remain large enough to tap and type');

console.log('Mobile chat layout checks passed.');
