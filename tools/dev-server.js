/**
 * @file tools/dev-server.js
 * Lightweight zero-dependency development server for CivicNeuro PWA.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PORT = 3000;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const packageImports = {};
for (const entry of fs.readdirSync(path.join(ROOT, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const packageDir = path.join(ROOT, 'packages', entry.name);
  const packageEntryPath = path.join(packageDir, 'src', 'index.js');
  if (fs.existsSync(packageEntryPath)) {
    packageImports[`@civicneuro/${entry.name}`] = `/packages/${entry.name}/src/index.js`;
  }
}
const importMap = JSON.stringify({ imports: packageImports });

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

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/apps/resident-pwa/index.html';
  }

  // Handle relative imports from resident-pwa
  let filePath = path.join(ROOT, reqPath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(ROOT, 'apps/resident-pwa', reqPath);
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isResidentIndex = filePath === path.join(ROOT, 'apps', 'resident-pwa', 'index.html');
    const nonce = isResidentIndex ? randomBytes(18).toString('base64') : null;
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Security-Policy': `script-src 'self' 'unsafe-eval'${nonce ? ` 'nonce-${nonce}'` : ''}; frame-ancestors 'none';`,
      'X-Content-Type-Options': 'nosniff'
    });

    if (isResidentIndex) {
      const html = fs.readFileSync(filePath, 'utf8').replace(
        '  <script type="module"',
        `  <script type="importmap" nonce="${nonce}">${importMap}</script>\n  <script type="module" nonce="${nonce}"`
      );
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
  console.log(`CivicNeuro Resident PWA running at http://localhost:${PORT}/`);
});
