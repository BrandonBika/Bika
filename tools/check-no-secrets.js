/**
 * @file tools/check-no-secrets.js
 */
import fs from 'node:fs';
import path from 'node:path';

let failed = false;
const SECRET_PATTERNS = [/eyJh[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+/, /sk_live_[0-9a-zA-Z]+/];

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) {
      scanDir(full);
    } else if (f.name.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf8');
      for (const p of SECRET_PATTERNS) {
        if (p.test(content)) {
          console.error(`❌ Potential hardcoded secret in: ${full}`);
          failed = true;
        }
      }
    }
  }
}

scanDir(path.resolve('apps/resident-pwa/src'));

if (failed) process.exit(1);
console.log('✅ PASS: No hardcoded secrets found.');
