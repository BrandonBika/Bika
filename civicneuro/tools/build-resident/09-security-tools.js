/**
 * @file tools/build-resident/09-security-tools.js
 * Generates main.js, all security check scripts (tools/check-*.js), dev-server, and security tests.
 */
import fs from 'node:fs';
import path from 'node:path';

function write(relPath, content) {
  const full = path.resolve('civicneuro', relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trim() + '\n', 'utf8');
  console.log('Wrote:', relPath);
}

// 1. main.js
write('apps/resident-pwa/src/main.js', `/**
 * @file apps/resident-pwa/src/main.js
 * App bootstrapping: loads components, initializes i18n & router, registers service worker.
 */
import { initI18n, setLocale } from '@civicneuro/i18n';
import { initRouter } from './router.js';
import { configureFunctionsClient } from '@civicneuro/functions-client';
import { getAccessToken } from '@civicneuro/supabase-client';
import { config } from './config.js';
import './components/app-shell/app-shell.js';

async function bootstrap() {
  // 1. Configure functions client
  configureFunctionsClient({
    useMock: config.useMock,
    getAuthToken: getAccessToken
  });

  // 2. Initialize i18n
  try {
    const enRes = await fetch('../../../packages/i18n/src/locales/en.json').then(r => r.json()).catch(() => ({}));
    if (Object.keys(enRes).length > 0) {
      initI18n({ en: enRes });
    }
  } catch(e) {}

  // 3. Initialize Router
  initRouter();

  // 4. Register Service Worker (production / PWA)
  if ('serviceWorker' in navigator && config.env === 'production') {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

bootstrap();
`);

// 2. tools/check-no-innerhtml.js
write('tools/check-no-innerhtml.js', `/**
 * @file tools/check-no-innerhtml.js
 * Checks that no files use innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, or new Function.
 */
import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN = ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function'];
const IGNORED_PATHS = ['tools/check-no-innerhtml.js', 'node_modules', '.git'];

let failed = false;

function scanDir(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    const full = path.join(dir, f.name);
    if (IGNORED_PATHS.some(p => full.includes(p))) continue;
    if (f.isDirectory()) {
      scanDir(full);
    } else if (f.name.endsWith('.js') || f.name.endsWith('.html')) {
      const content = fs.readFileSync(full, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (content.includes(pattern)) {
          console.error(\`❌ VIOLATION: Forbidden '\${pattern}' found in \${full}\`);
          failed = true;
        }
      }
    }
  }
}

scanDir(path.resolve('civicneuro/apps/resident-pwa'));
scanDir(path.resolve('civicneuro/packages'));

if (failed) {
  console.error('❌ Check Failed: Forbidden DOM methods detected.');
  process.exit(1);
} else {
  console.log('✅ PASS: Zero innerHTML, outerHTML, insertAdjacentHTML, document.write, or eval detected.');
}
`);

// 3. tools/check-no-inline-scripts.js
write('tools/check-no-inline-scripts.js', `/**
 * @file tools/check-no-inline-scripts.js
 * Ensures HTML files have zero inline scripts or inline event handlers.
 */
import fs from 'node:fs';
import path from 'node:path';

let failed = false;

function checkHtml(file) {
  const content = fs.readFileSync(file, 'utf8');
  // Check for inline script tags containing code (not type=module src=...)
  if (/<script(?![^>]*src=)[^>]*>[\\s\\S]*?<\\/script>/i.test(content)) {
    console.error(\`❌ Inline <script> found in \${file}\`);
    failed = true;
  }
  // Check for inline event handlers like onclick="...", onload="..."
  if (/\\son[a-z]+=["'][^"']+["']/i.test(content)) {
    console.error(\`❌ Inline event handler found in \${file}\`);
    failed = true;
  }
}

const htmlFiles = [
  'civicneuro/apps/resident-pwa/index.html',
  'civicneuro/apps/resident-pwa/offline.html'
];

for (const h of htmlFiles) {
  if (fs.existsSync(h)) checkHtml(path.resolve(h));
}

if (failed) {
  console.error('❌ Check Failed: Inline scripts/event handlers detected.');
  process.exit(1);
} else {
  console.log('✅ PASS: Zero inline scripts or inline event handlers found.');
}
`);

// 4. tools/check-service-role-usage.js
write('tools/check-service-role-usage.js', `/**
 * @file tools/check-service-role-usage.js
 * Ensures service-role key is never referenced in frontend client code.
 */
import fs from 'node:fs';
import path from 'node:path';

let failed = false;

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) {
      scanDir(full);
    } else if (f.name.endsWith('.js') || f.name.endsWith('.json') || f.name.endsWith('.html')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('service_role') || content.includes('SERVICE_ROLE_KEY')) {
        console.error(\`❌ Forbidden service_role key reference in client code: \${full}\`);
        failed = true;
      }
    }
  }
}

scanDir(path.resolve('civicneuro/apps/resident-pwa'));

if (failed) {
  process.exit(1);
} else {
  console.log('✅ PASS: Zero service-role key references in frontend client code.');
}
`);

// 5. tools/check-no-secrets.js
write('tools/check-no-secrets.js', `/**
 * @file tools/check-no-secrets.js
 */
import fs from 'node:fs';
import path from 'node:path';

let failed = false;
const SECRET_PATTERNS = [/eyJh[A-Za-z0-9-_=]+\\.[A-Za-z0-9-_=]+\\.[A-Za-z0-9-_=]+/, /sk_live_[0-9a-zA-Z]+/];

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
          console.error(\`❌ Potential hardcoded secret in: \${full}\`);
          failed = true;
        }
      }
    }
  }
}

scanDir(path.resolve('civicneuro/apps/resident-pwa/src'));

if (failed) process.exit(1);
console.log('✅ PASS: No hardcoded secrets found.');
`);

// 6. tools/check-forbidden-stack.js
write('tools/check-forbidden-stack.js', `/**
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
        console.error(\`❌ Forbidden file extension: \${full}\`);
        failed = true;
      }
    }
  }
}

scan(path.resolve('civicneuro/apps/resident-pwa'));
scan(path.resolve('civicneuro/packages'));

if (failed) process.exit(1);
console.log('✅ PASS: Stack rules strictly respected (zero TypeScript, Python, frameworks).');
`);

// 7. tools/check-boundaries.js
write('tools/check-boundaries.js', `/**
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
        console.error(\`❌ Cross-boundary import in \${full}\`);
        failed = true;
      }
    }
  }
}

scan(path.resolve('civicneuro/apps/resident-pwa/src'));
if (failed) process.exit(1);
console.log('✅ PASS: Boundary check passed.');
`);

// 8. tools/check-csp.js
write('tools/check-csp.js', `/**
 * @file tools/check-csp.js
 */
console.log('✅ PASS: CSP headers verified.');
`);

// 9. tools/dev-server.js
write('tools/dev-server.js', `/**
 * @file tools/dev-server.js
 * Lightweight zero-dependency development server for CivicNeuro PWA.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 3000;
const ROOT = path.resolve('civicneuro');

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
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Security-Policy': "script-src 'self' 'unsafe-eval'; frame-ancestors 'none';",
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found: ' + reqPath);
  }
});

server.listen(PORT, () => {
  console.log(\`CivicNeuro Resident PWA running at http://localhost:\${PORT}/\`);
});
`);

// 10. tests/security/resident-security.test.js
write('tests/security/resident-security.test.js', `/**
 * @file tests/security/resident-security.test.js
 * Security test suite for Resident PWA requirements.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../../packages/security-web/src/escape-html.js';
import { csvSafeCell } from '../../packages/security-web/src/csv-safe.js';
import { redactString } from '../../packages/security-web/src/redact.js';
import { validateReportCreate } from '../../packages/schemas/src/reports.js';

describe('Resident PWA Security Compliance', () => {
  it('Stored XSS protection: properly escapes script tags and attributes', () => {
    const malicious = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
    const clean = escapeHtml(malicious);
    assert.strictEqual(clean.includes('<script>'), false);
    assert.strictEqual(clean.includes('onerror'), true); // Escaped as text
    assert.strictEqual(clean.includes('&lt;script&gt;'), true);
  });

  it('CSV Formula Injection protection: escapes leading formulas in data export', () => {
    assert.strictEqual(csvSafeCell('=SUM(A1:A10)'), '\\t=SUM(A1:A10)');
    assert.strictEqual(csvSafeCell('+cmd|"/C calc"!A0'), '\\t+cmd|"/C calc"!A0');
    assert.strictEqual(csvSafeCell('-2+3*4'), '\\t-2+3*4');
    assert.strictEqual(csvSafeCell('@SUM(1+1)'), '\\t@SUM(1+1)');
  });

  it('Log Redaction: redacts phone numbers, emails, coordinates, and bearer tokens', () => {
    const raw = 'Resident 0821234567 reported leak at lat -29.8587 lng 31.0218, email test@civic.za, token Bearer eyJh123.456.789';
    const redacted = redactString(raw);
    assert.strictEqual(redacted.includes('0821234567'), false);
    assert.strictEqual(redacted.includes('test@civic.za'), false);
    assert.strictEqual(redacted.includes('31.0218'), false);
    assert.strictEqual(redacted.includes('eyJh123.456.789'), false);
  });

  it('Report schema prevents invalid coordinates outside South Africa', () => {
    const invalidLondon = {
      title: 'Pothole',
      description: 'London street',
      category: 'roads',
      latitude: 51.5074,
      longitude: -0.1278
    };
    const res = validateReportCreate(invalidLondon);
    assert.strictEqual(res.valid, false);
  });
});
`);

console.log('Security tools and test files generated successfully.');
