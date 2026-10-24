import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = path.join(ROOT, 'apps', 'resident-pwa');
const OUTPUT_DIR = path.join(ROOT, 'dist');
const LOCAL_ENV_PATH = path.join(ROOT, '.env');

function loadLocalEnv() {
  if (!fs.existsSync(LOCAL_ENV_PATH)) return;

  const contents = fs.readFileSync(LOCAL_ENV_PATH, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;

    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function getPublicConfig() {
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY']
    .filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. `
      + 'Set them in the Vercel project environment or in the local .env file.'
    );
  }

  return {
    supabaseUrl: process.env.SUPABASE_URL.trim(),
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY.trim()
  };
}

function copyResidentApp() {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.cpSync(APP_DIR, OUTPUT_DIR, {
    recursive: true,
    filter(sourcePath) {
      const relativePath = path.relative(APP_DIR, sourcePath);
      const segments = relativePath.split(path.sep);
      const name = path.basename(sourcePath);
      return !segments.includes('test')
        && !['README.md', 'PROJECT_REPORT.md', 'package.json'].includes(name);
    }
  });
}

function addSharedPackages() {
  const packagesDir = path.join(ROOT, 'packages');
  const imports = {};

  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const sourceDir = path.join(packagesDir, entry.name, 'src');
    const entryPath = path.join(sourceDir, 'index.js');
    if (!fs.existsSync(entryPath)) continue;

    const targetDir = path.join(OUTPUT_DIR, 'packages', entry.name, 'src');
    fs.cpSync(sourceDir, targetDir, { recursive: true });
    imports[`@civicneuro/${entry.name}`] = `/packages/${entry.name}/src/index.js`;
  }

  const indexPath = path.join(OUTPUT_DIR, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  const importMapPattern = /(<script\s+type="importmap"\s+id="cn-importmap">)([\s\S]*?)(<\/script>)/;
  const match = html.match(importMapPattern);
  if (!match) {
    throw new Error('Could not find the resident app import map in apps/resident-pwa/index.html.');
  }

  const importMap = JSON.parse(match[2]);
  importMap.imports = { ...imports, ...importMap.imports };
  fs.writeFileSync(indexPath, html.replace(
    importMapPattern,
    `${match[1]}${JSON.stringify(importMap)}${match[3]}`
  ));
}

function copyLandingAssets() {
  const sourceDir = path.join(ROOT, 'apps', 'landing', 'assets');
  const targetDir = path.join(OUTPUT_DIR, 'landing', 'assets');
  fs.cpSync(sourceDir, targetDir, { recursive: true });
}

loadLocalEnv();
const publicConfig = getPublicConfig();
copyResidentApp();
addSharedPackages();
copyLandingAssets();

const runtimeConfig = {
  env: 'production',
  useMock: false,
  beaconEnabled: false,
  ...publicConfig
};
fs.writeFileSync(
  path.join(OUTPUT_DIR, 'runtime-config.js'),
  `const runtimeConfig = ${JSON.stringify(runtimeConfig)};\nexport default runtimeConfig;\n`
);

console.log('Built resident PWA to dist/.');
