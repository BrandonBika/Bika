/**
 * @file tools/check-boundaries.js
 * Ensures resident-pwa does not import from org-dashboard or platform-admin.
 */
import fs from 'node:fs';
import path from 'node:path';

let failed = false;
function scan(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) scan(full);
    else if (f.name.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('org-dashboard') || content.includes('platform-admin')) {
        console.error(`❌ Cross-boundary import in ${full}`);
        failed = true;
      }
    }
  }
}

scan(path.resolve('apps/resident-pwa/src'));
if (failed) process.exit(1);
console.log('✅ PASS: Boundary check passed.');
