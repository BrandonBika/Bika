import fs from 'node:fs';
import path from 'node:path';
import {
  createDatabaseClient,
  loadDevConfig,
  repoRoot,
  safeError
} from './dev-supabase-test-helpers.js';

const testsDirectory = path.join(repoRoot, 'supabase', 'tests');
const testFiles = fs.readdirSync(testsDirectory)
  .filter((name) => name.endsWith('.test.sql'))
  .sort();
const config = loadDevConfig();
const emptyFiles = [];
const results = [];

console.log('SAFE TARGET CHECK PASS: dev .env.test target differs from linked/runtime project references.');

for (const filename of testFiles) {
  const filePath = path.join(testsDirectory, filename);
  const sql = fs.readFileSync(filePath, 'utf8').trim();
  if (!sql) {
    emptyFiles.push(filename);
    console.log(`NOT VERIFIED ${filename}: file is empty; no assertions to execute.`);
    continue;
  }

  const client = createDatabaseClient(config.databaseUrl);
  let phaseSequenceCreated = false;
  try {
    await client.connect();
    if (filename === 'phase_a_privilege_hardening.test.sql') {
      const existing = await client.query("SELECT to_regclass('public.cn_phase_a_test_results') AS name");
      if (existing.rows[0].name) {
        throw new Error('Phase A prerequisite sequence already exists; refusing to alter it.');
      }
      await client.query('CREATE SEQUENCE public.cn_phase_a_test_results MINVALUE 0 START WITH 0');
      phaseSequenceCreated = true;
    }

    const queryResult = await client.query(sql);
    const resultSets = Array.isArray(queryResult) ? queryResult : [queryResult];
    const outputRows = resultSets.flatMap((result) => result?.rows || []);
    const checks = outputRows.filter((row) => (
      Object.hasOwn(row, 'passed') || Object.hasOwn(row, 'result')
    ));
    const failures = checks.filter((row) => (
      row.passed === false
      || String(row.result || '').toUpperCase() === 'FAIL'
      || row.passed === 'f'
    ));
    if (failures.length) {
      const names = failures.map((row) => row.test_name || row.test || 'unnamed check');
      throw new Error(`${failures.length} assertion(s) failed: ${names.join('; ')}`);
    }
    if (!checks.length) {
      throw new Error('No assertion result rows were returned by the SQL test.');
    }
    results.push({ filename, checks: checks.length });
    console.log(`PASS ${filename}: ${checks.length} assertion(s), all passed.`);
  } catch (error) {
    results.push({ filename, error });
    console.log(`FAIL ${filename}: ${safeError(error, config)}`);
  } finally {
    if (phaseSequenceCreated) {
      try {
        await client.query('DROP SEQUENCE public.cn_phase_a_test_results');
      } catch (error) {
        console.log(`FAIL ${filename} prerequisite cleanup: ${safeError(error, config)}`);
        results.push({ filename: `${filename} prerequisite cleanup`, error });
      }
    }
    await client.end().catch((error) => {
      console.log(`FAIL ${filename} connection cleanup: ${safeError(error, config)}`);
      results.push({ filename: `${filename} connection cleanup`, error });
    });
  }
}

console.log(`SQL TEST SUMMARY: ${results.filter((result) => !result.error).length} PASS, ${results.filter((result) => result.error).length} FAIL, ${emptyFiles.length} NOT VERIFIED (empty files).`);
if (results.some((result) => result.error)) process.exitCode = 1;
