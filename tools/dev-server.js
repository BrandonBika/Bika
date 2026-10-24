/**
 * @file tools/dev-server.js
 * Lightweight zero-dependency development server for CivicNeuro PWA.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadDevConfig, loadProjectEnv } from '../scripts/dev-supabase-test-helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadProjectEnv();
const PORT = Number(process.env.PORT || 3000);
const demoMode = process.argv.includes('--demo');
const devConfig = loadDevConfig();
const zegoEnv = {
  ZEGO_APP_ID: devConfig.env.get('ZEGO_APP_ID'),
  ZEGO_SERVER_SECRET: devConfig.env.get('ZEGO_SERVER_SECRET')
};
const CONTENT_SECURITY_POLICY = [
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://zego.im wss://zego.im https://*.zego.im wss://*.zego.im https://zegocloud.com wss://zegocloud.com https://*.zegocloud.com wss://*.zegocloud.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'"
].join('; ');
const runtimeConfig = {
  supabaseUrl: demoMode ? devConfig.supabaseUrl : process.env.SUPABASE_URL || '',
  supabaseAnonKey: demoMode ? devConfig.anonKey : process.env.SUPABASE_ANON_KEY || '',
  appEnvironment: 'development'
};
const runtimeConfigSource = `const runtimeConfig = ${JSON.stringify(runtimeConfig)};\nexport default runtimeConfig;\n`;
const runtimeOptionsSource = `const runtimeOptions = ${JSON.stringify({
  env: 'development',
  useMock: false,
  beaconEnabled: demoMode
})};\nexport default runtimeOptions;\n`;

const packageImports = {};
for (const entry of fs.readdirSync(path.join(ROOT, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const packageDir = path.join(ROOT, 'packages', entry.name);
  const packageEntryPath = path.join(packageDir, 'src', 'index.js');
  if (fs.existsSync(packageEntryPath)) {
    packageImports[`@civicneuro/${entry.name}`] = `/packages/${entry.name}/src/index.js`;
  }
}
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

const STATIC_ROOTS = [
  path.join(ROOT, 'apps', 'landing'),
  path.join(ROOT, 'apps', 'platform-admin'),
  path.join(ROOT, 'apps', 'resident-pwa'),
  path.join(ROOT, 'packages')
];
const REAL_STATIC_ROOTS = STATIC_ROOTS.map((root) => fs.realpathSync(root));
const BLOCKED_PATH_MARKERS = ['node_modules', 'supabase', 'tools', 'docs'];

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function isRequiredSupabaseAsset(pathname) {
  return pathname.startsWith('/packages/supabase-client/src/')
    || pathname === '/apps/platform-admin/src/features/supabase.client.js'
    || pathname === '/platform-admin/src/features/supabase.client.js'
    || pathname === '/apps/resident-pwa/vendor/supabase-js.js'
    || pathname === '/resident-pwa/vendor/supabase-js.js';
}

function resolveStaticPath(requestPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  if (decodedPath.includes('\\') || decodedPath.includes('\0') || /%[0-9a-f]{2}/i.test(decodedPath)) {
    return null;
  }

  const segments = decodedPath.split('/');
  if (segments.some((segment) => segment.startsWith('.')
    || BLOCKED_PATH_MARKERS.some((marker) => segment.toLowerCase().includes(marker)))) {
    if (!isRequiredSupabaseAsset(decodedPath)) return null;
    if (segments.some((segment) => segment.startsWith('.')
      || ['node_modules', 'tools', 'docs'].some((marker) => segment.toLowerCase().includes(marker)))) {
      return null;
    }
  }

  let relativePath;
  let staticRoot;
  if (decodedPath === '/') {
    staticRoot = STATIC_ROOTS[0];
    relativePath = 'index.html';
  } else if (decodedPath.startsWith('/landing/')) {
    staticRoot = STATIC_ROOTS[0];
    relativePath = decodedPath.slice('/landing/'.length);
  } else if (decodedPath.startsWith('/platform-admin/')) {
    staticRoot = STATIC_ROOTS[1];
    relativePath = decodedPath.slice('/platform-admin/'.length);
  } else if (decodedPath.startsWith('/resident-pwa/')) {
    staticRoot = STATIC_ROOTS[2];
    relativePath = decodedPath.slice('/resident-pwa/'.length);
  } else if (decodedPath.startsWith('/apps/resident-pwa/')) {
    staticRoot = STATIC_ROOTS[2];
    relativePath = decodedPath.slice('/apps/resident-pwa/'.length);
  } else if (decodedPath === '/runtime-config.js') {
    staticRoot = STATIC_ROOTS[2];
    relativePath = 'runtime-config.js';
  } else if (decodedPath.startsWith('/packages/')) {
    staticRoot = STATIC_ROOTS[3];
    relativePath = decodedPath.slice('/packages/'.length);
  } else {
    return null;
  }

  const resolvedRoot = path.resolve(staticRoot);
  let resolvedPath = path.resolve(resolvedRoot, relativePath);
  if (!isWithin(resolvedRoot, resolvedPath)) return null;

  try {
    if (!fs.existsSync(resolvedPath)) return null;
    if (fs.statSync(resolvedPath).isDirectory()) {
      resolvedPath = path.join(resolvedPath, 'index.html');
    }
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) return null;

    const realPath = fs.realpathSync(resolvedPath);
    if (!isWithin(REAL_STATIC_ROOTS[STATIC_ROOTS.indexOf(staticRoot)], realPath)) return null;
    return realPath;
  } catch {
    return null;
  }
}

const server = http.createServer((req, res) => {
  const [rawPath, query = ''] = req.url.split('?', 2);
  let reqPath;
  try {
    reqPath = decodeURIComponent(rawPath);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  if (reqPath === '/platform-admin' || reqPath === '/resident-pwa') {
    res.writeHead(301, { Location: `${reqPath}/${query ? `?${query}` : ''}` });
    res.end();
    return;
  }

  if (reqPath === '/api/zego-token') {
    import('../supabase/functions/zego-token/handler.js')
      .then(async ({ handleZegoToken }) => {
        const request = new Request('http://localhost/api/zego-token', {
          method: req.method,
          headers: { authorization: req.headers.authorization || '' }
        });
        const result = await handleZegoToken(request, {
          env: zegoEnv,
          supabaseUrl: devConfig.supabaseUrl,
          anonKey: devConfig.anonKey
        });
        res.writeHead(result.status, {
          'Content-Type': result.headers.get('content-type'),
          'Cache-Control': 'no-store',
          'Content-Security-Policy': CONTENT_SECURITY_POLICY
        });
        res.end(await result.text());
      })
      .catch((error) => {
        console.error('Zego token route failed.', error);
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'Call token request failed.' }));
      });
    return;
  }

  if ([
    '/runtime-config.js',
    '/apps/resident-pwa/runtime-config.js',
    '/resident-pwa/runtime-config.js',
    '/platform-admin/runtime-config.js',
    '/apps/platform-admin/runtime-config.js'
  ].includes(reqPath)) {
    res.writeHead(200, {
      'Content-Type': 'text/javascript',
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store'
    });
    res.end(runtimeConfigSource);
    return;
  }

  if ([
    '/runtime-options.js',
    '/apps/resident-pwa/runtime-options.js',
    '/resident-pwa/runtime-options.js'
  ].includes(reqPath)) {
    res.writeHead(200, {
      'Content-Type': 'text/javascript',
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store'
    });
    res.end(runtimeOptionsSource);
    return;
  }

  const filePath = resolveStaticPath(reqPath);

  if (filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isResidentIndex = filePath === path.join(ROOT, 'apps', 'resident-pwa', 'index.html');
    const nonce = isResidentIndex ? randomBytes(18).toString('base64') : null;
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Security-Policy': `script-src 'self' https://cdn.jsdelivr.net 'unsafe-eval' blob:${nonce ? ` 'nonce-${nonce}'` : ''}; ${CONTENT_SECURITY_POLICY}`,
      'X-Content-Type-Options': 'nosniff'
    });

    if (isResidentIndex) {
      const html = fs.readFileSync(filePath, 'utf8')
        .replace(/<script type="importmap" id="cn-importmap">([\s\S]*?)<\/script>/, (_match, rawMap) => {
          const staticImports = JSON.parse(rawMap).imports || {};
          return `<script type="importmap" id="cn-importmap" nonce="${nonce}">${JSON.stringify({
            imports: { ...packageImports, ...staticImports }
          })}</script>`;
        })
        .replace('  <script type="module"', `  <script type="module" nonce="${nonce}"`);
      res.end(html);
    } else {
      fs.createReadStream(filePath).pipe(res);
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found: ' + reqPath);
  }
});

server.listen(PORT, () => {
  console.log(`CivicNeuro local apps running at http://localhost:${PORT}/`);
});
