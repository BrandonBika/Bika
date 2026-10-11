/**
 * @file tools/check-no-inline-scripts.js
 * Ensures HTML files have zero inline scripts or inline event handlers.
 */
import fs from 'node:fs';
import path from 'node:path';

let failed = false;

function checkHtml(file) {
  const content = fs.readFileSync(file, 'utf8');
  // Check for inline script tags containing code (not type=module src=...)
  if (/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/i.test(content)) {
    console.error(`❌ Inline <script> found in ${file}`);
    failed = true;
  }
  // Check for inline event handlers like onclick="...", onload="..."
  if (/\son[a-z]+=["'][^"']+["']/i.test(content)) {
    console.error(`❌ Inline event handler found in ${file}`);
    failed = true;
  }
}

const htmlFiles = [
  'civicneuro/apps/resident-pwa/index.html',
  'civicneuro/apps/resident-pwa/offline.html'
];

for (const h of htmlFiles) {
  if (fs.existsSync(h)) checkHtml(path.resolve(h));
}

if (failed) {
  console.error('❌ Check Failed: Inline scripts/event handlers detected.');
  process.exit(1);
} else {
  console.log('✅ PASS: Zero inline scripts or inline event handlers found.');
}
