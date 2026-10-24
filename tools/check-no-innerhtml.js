/**
 * @file tools/check-no-innerhtml.js
 * Checks that no files use innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, or new Function.
 */
import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN_PATTERNS = [
  /\.innerHTML\b/,
  /\.outerHTML\b/,
  /\.insertAdjacentHTML\s*\(/,
  /document\.write\s*\(/,
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/
];

const IGNORED_PATHS = [
  'check-no-innerhtml.js',
  'node_modules',
  path.join('public', 'vendor'),
  path.join('apps', 'resident-pwa', 'vendor'),
  '.git'
];

let failed = false;

function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    const full = path.join(dir, f.name);
    if (IGNORED_PATHS.some(p => full.includes(p))) continue;
    if (f.isDirectory()) {
      scanDir(full);
    } else if (f.name.endsWith('.js') || f.name.endsWith('.html')) {
      const content = fs.readFileSync(full, 'utf8');
      const cleanCode = stripComments(content);
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(cleanCode)) {
          console.error(`❌ VIOLATION: Forbidden pattern ${pattern} found in ${full}`);
          failed = true;
        }
      }
    }
  }
}

scanDir(path.resolve('apps/resident-pwa'));
scanDir(path.resolve('packages'));

if (failed) {
  console.error('❌ Check Failed: Forbidden DOM methods detected in executable code.');
  process.exit(1);
} else {
  console.log('✅ PASS: Zero innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, or new Function detected.');
}
