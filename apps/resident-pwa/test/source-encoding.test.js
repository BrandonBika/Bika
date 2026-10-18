import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEXT_SOURCE_EXTENSIONS = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.svg', '.ts', '.tsx'
]);
const MOJIBAKE_PATTERN = /Ã[\u00A0-\u00BF]|Â[\u00A0-\u00BF]|â€|ðŸ|ï»¿/u;
const REPLACEMENT_CHARACTER = '\uFFFD';

async function collectTextFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTextFiles(entryPath));
    } else if (entry.isFile() && TEXT_SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(entryPath);
    }
  }
  return files;
}

test('resident source and packages contain valid UTF-8 text without replacement characters or common mojibake', async () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const roots = [
    path.join(repositoryRoot, 'apps', 'resident-pwa', 'src'),
    path.join(repositoryRoot, 'packages')
  ];
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const problems = [];

  for (const root of roots) {
    for (const filename of await collectTextFiles(root)) {
      let content;
      try {
        content = decoder.decode(await readFile(filename));
      } catch {
        problems.push(`${path.relative(repositoryRoot, filename)}: invalid UTF-8`);
        continue;
      }
      if (content.includes(REPLACEMENT_CHARACTER)) {
        problems.push(`${path.relative(repositoryRoot, filename)}: contains U+FFFD`);
      }
      if (MOJIBAKE_PATTERN.test(content)) {
        problems.push(`${path.relative(repositoryRoot, filename)}: contains common mojibake`);
      }
    }
  }

  assert.deepEqual(problems, []);
});
