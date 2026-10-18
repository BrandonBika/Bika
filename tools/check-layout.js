import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const allowedRoots = new Set([
  path.join(root, 'apps'),
  path.join(root, 'packages')
]);
const skippedDirectories = new Set(['.git', 'node_modules']);
const nestedProjectDirectories = [];

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || skippedDirectories.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);
    if (
      ['apps', 'packages'].includes(entry.name)
      && !allowedRoots.has(fullPath)
    ) {
      nestedProjectDirectories.push(path.relative(root, fullPath));
    }
    scan(fullPath);
  }
}

scan(root);

if (nestedProjectDirectories.length) {
  console.error('❌ Nested project layout detected:');
  for (const directory of nestedProjectDirectories) {
    console.error(`  - ${directory}`);
  }
  process.exit(1);
}

console.log('✅ PASS: No nested project layout detected.');
