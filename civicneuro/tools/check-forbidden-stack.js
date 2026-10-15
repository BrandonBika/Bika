/**
 * @file tools/check-forbidden-stack.js
 */
import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN_EXTS = ['.ts', '.tsx', '.jsx', '.py', '.vue', '.svelte'];
let failed = false;

function scan(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (f.name !== 'node_modules' && f.name !== '.git') scan(full);
    } else {
      if (FORBIDDEN_EXTS.some(ext => f.name.endsWith(ext))) {
        console.error(`❌ Forbidden file extension: ${full}`);
        failed = true;
      }
    }
  }
}

scan(path.resolve('civicneuro/apps/resident-pwa'));
scan(path.resolve('civicneuro/packages'));

if (failed) process.exit(1);
console.log('✅ PASS: Stack rules strictly respected (zero TypeScript, Python, frameworks).');
