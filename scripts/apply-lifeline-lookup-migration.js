import fs from 'node:fs';
import path from 'node:path';
import {
  createDatabaseClient,
  loadDevConfig,
  repoRoot,
  safeError
} from './dev-supabase-test-helpers.js';

const config = loadDevConfig();
const migrationPath = path.join(
  repoRoot,
  'supabase',
  'migrations',
  '20261023000100_lifeline_circle_contact_lookup.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const db = createDatabaseClient(config.databaseUrl);

try {
  await db.connect();
  const ref = new URL(config.supabaseUrl).hostname.split('.')[0];
  console.log(`SAFE TARGET CHECK PASS: applying Lifeline lookup migration to guarded dev project ${ref}.`);
  await db.query('BEGIN');
  await db.query(sql);
  await db.query('COMMIT');
  console.log('LIFELINE LOOKUP MIGRATION APPLIED.');
} catch (error) {
  await db.query('ROLLBACK').catch(() => {});
  console.error(`LIFELINE LOOKUP MIGRATION FAILED: ${safeError(error, config)}`);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
