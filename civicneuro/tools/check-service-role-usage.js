/**
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
        console.error(`❌ Forbidden service_role key reference in client code: ${full}`);
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
