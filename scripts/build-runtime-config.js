import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.join(ROOT, 'dist');
const LOCAL_ENV_PATH = path.join(ROOT, '.env');
const DEPLOYED_APPS = ['resident-pwa', 'platform-admin'];
const EXCLUDED_NAMES = new Set(['README.md', 'PROJECT_REPORT.md', 'package.json']);

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
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY.trim(),
    appEnvironment: getAppEnvironment()
  };
}

function getAppEnvironment() {
  const values = [process.env.APP_ENV, process.env.NODE_ENV]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  if (values.some((value) => value !== 'development')) return 'production';
  return values.length > 0 ? 'development' : 'production';
}

function copyDirectory(sourceDir, targetDir, { excludeIndex = false } = {}) {
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    filter(sourcePath) {
      const relativePath = path.relative(sourceDir, sourcePath);
      const segments = relativePath.split(path.sep);
      const name = path.basename(sourcePath);
      return !segments.includes('test')
        && !EXCLUDED_NAMES.has(name)
        && !(excludeIndex && relativePath === 'index.html');
    }
  });
}

function copyLandingPage() {
  const sourceDir = path.join(ROOT, 'apps', 'landing');
  fs.copyFileSync(path.join(sourceDir, 'index.html'), path.join(OUTPUT_DIR, 'index.html'));
  copyDirectory(sourceDir, path.join(OUTPUT_DIR, 'landing'), { excludeIndex: true });
}

function copySharedPackages() {
  const packagesDir = path.join(ROOT, 'packages');

  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const sourceDir = path.join(packagesDir, entry.name, 'src');
    if (!fs.existsSync(path.join(sourceDir, 'index.js'))) continue;
    fs.cpSync(sourceDir, path.join(OUTPUT_DIR, 'packages', entry.name, 'src'), { recursive: true });
  }
}

function addSharedImportMap(indexPath) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const imports = {};
  const packageDirs = path.join(OUTPUT_DIR, 'packages');

  for (const entry of fs.readdirSync(packageDirs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!fs.existsSync(path.join(packageDirs, entry.name, 'src', 'index.js'))) continue;
    imports[`@civicneuro/${entry.name}`] = `/packages/${entry.name}/src/index.js`;
  }

  const importMapPattern = /(<script\s+type="importmap"(?:\s+id="[^"]+")?\s*>)([\s\S]*?)(<\/script>)/i;
  const match = html.match(importMapPattern);
  let output;

  if (match) {
    const importMap = JSON.parse(match[2]);
    importMap.imports = { ...imports, ...importMap.imports };
    output = html.replace(importMapPattern, `${match[1]}${JSON.stringify(importMap)}${match[3]}`);
  } else {
    const importMap = `<script type="importmap">${JSON.stringify({ imports })}</script>\n`;
    output = html.replace(/(<script\s+type="module"(?=\s|>))/i, `${importMap}  $1`);
  }

  if (output === html && !match && Object.keys(imports).length > 0) {
    throw new Error(`Could not insert an import map into ${indexPath}.`);
  }
  fs.writeFileSync(indexPath, output);
}

function writeRuntimeConfigs(publicConfig) {
  const runtimeConfig = `const runtimeConfig = ${JSON.stringify(publicConfig)};\nexport default runtimeConfig;\n`;

  for (const app of DEPLOYED_APPS) {
    const appOutputDir = path.join(OUTPUT_DIR, app);
    fs.writeFileSync(path.join(appOutputDir, 'runtime-config.js'), runtimeConfig);
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'resident-pwa', 'runtime-options.js'),
    'const runtimeOptions = { env: \'production\', useMock: false, beaconEnabled: false };\n'
      + 'export default runtimeOptions;\n'
  );
}

function resolveLocalTarget(reference, baseDir) {
  if (!reference || reference.startsWith('#') || /^(?:[a-z]+:|\/\/)/i.test(reference)) return null;
  const rawPath = reference.split(/[?#]/, 1)[0];
  const targetPath = reference.startsWith('/')
    ? path.join(OUTPUT_DIR, decodeURIComponent(rawPath.slice(1)))
    : path.resolve(baseDir, decodeURIComponent(rawPath));
  return targetPath;
}

function assertExists(reference, baseDir, sourceDescription) {
  const target = resolveLocalTarget(reference, baseDir);
  if (target && !fs.existsSync(target)) {
    throw new Error(`${sourceDescription} points to missing build output: ${reference}`);
  }
}

function validateHtmlAssets(indexPath) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const appDir = path.dirname(indexPath);

  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    assertExists(match[1], appDir, indexPath);
  }

  for (const match of html.matchAll(/<script\s+type="importmap"(?:\s+id="[^"]+")?\s*>([\s\S]*?)<\/script>/gi)) {
    const importMap = JSON.parse(match[1]);
    for (const target of Object.values(importMap.imports || {})) {
      assertExists(target, appDir, `${indexPath} import map`);
    }
  }
}

function validateCssAssets(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      validateCssAssets(entryPath);
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      const css = fs.readFileSync(entryPath, 'utf8');
      for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
        assertExists(match[1].trim(), path.dirname(entryPath), entryPath);
      }
    }
  }
}

function validateBuild() {
  const expectedIndexes = [
    path.join(OUTPUT_DIR, 'index.html'),
    ...DEPLOYED_APPS.map((app) => path.join(OUTPUT_DIR, app, 'index.html'))
  ];
  for (const indexPath of expectedIndexes) {
    if (!fs.existsSync(indexPath)) throw new Error(`Build is missing ${indexPath}.`);
    validateHtmlAssets(indexPath);
  }

  for (const app of DEPLOYED_APPS) {
    const runtimeConfig = fs.readFileSync(path.join(OUTPUT_DIR, app, 'runtime-config.js'), 'utf8');
    const configMatch = runtimeConfig.match(/const runtimeConfig = (\{.*\});/);
    if (!configMatch) throw new Error(`Could not validate ${app} runtime config.`);
    const keys = Object.keys(JSON.parse(configMatch[1])).sort();
    if (keys.join(',') !== 'appEnvironment,supabaseAnonKey,supabaseUrl') {
      throw new Error(`${app} runtime config must contain Supabase URL, anon key, and app environment.`);
    }
    const config = JSON.parse(configMatch[1]);
    if (!['development', 'production'].includes(config.appEnvironment)) {
      throw new Error(`${app} runtime config has an invalid app environment.`);
    }
  }

  const [residentRuntimeConfig, platformRuntimeConfig] = DEPLOYED_APPS.map((app) => {
    const contents = fs.readFileSync(path.join(OUTPUT_DIR, app, 'runtime-config.js'), 'utf8');
    return JSON.parse(contents.match(/const runtimeConfig = (\{.*\});/)[1]);
  });
  if (JSON.stringify(residentRuntimeConfig) !== JSON.stringify(platformRuntimeConfig)) {
    throw new Error('Resident and platform dashboard Supabase configs do not match.');
  }

  const residentDir = path.join(OUTPUT_DIR, 'resident-pwa');
  const manifestPath = path.join(residentDir, 'manifest.webmanifest');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.start_url.startsWith('./') || manifest.scope !== './') {
    throw new Error('Resident manifest start_url and scope must remain inside /resident-pwa/.');
  }
  assertExists(manifest.start_url, residentDir, manifestPath);
  for (const icon of manifest.icons || []) assertExists(icon.src, residentDir, manifestPath);

  const serviceWorkerPath = path.join(residentDir, 'service-worker.js');
  const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
  const shellAssets = serviceWorker.match(/const SHELL_ASSETS = \[([\s\S]*?)\];/);
  if (!shellAssets) throw new Error('Could not find resident service worker shell assets.');
  for (const match of shellAssets[1].matchAll(/['"]([^'"]+)['"]/g)) {
    assertExists(match[1], residentDir, serviceWorkerPath);
  }

  validateCssAssets(OUTPUT_DIR);
}

loadLocalEnv();
const publicConfig = getPublicConfig();
fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
copyLandingPage();
copySharedPackages();

for (const app of DEPLOYED_APPS) {
  const sourceDir = path.join(ROOT, 'apps', app);
  const targetDir = path.join(OUTPUT_DIR, app);
  copyDirectory(sourceDir, targetDir);
  addSharedImportMap(path.join(targetDir, 'index.html'));
}

writeRuntimeConfigs(publicConfig);
validateBuild();

console.log('Built landing page, resident PWA, platform dashboard, and shared packages to dist/.');
