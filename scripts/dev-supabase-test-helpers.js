import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(repoRoot, '.env.test');

function parseEnvFile(contents) {
  const values = new Map();
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const raw = match[2];
    values.set(match[1], raw.replace(/^(['"])(.*)\1$/, '$2'));
  }
  return values;
}

function collectProjectRefs() {
  const refs = new Set();
  const projectRefPath = path.join(repoRoot, 'supabase', '.temp', 'project-ref');
  if (fs.existsSync(projectRefPath)) {
    const ref = fs.readFileSync(projectRefPath, 'utf8').trim();
    if (ref) refs.add(ref);
  }

  const configPath = path.join(repoRoot, 'supabase', 'config.toml');
  if (fs.existsSync(configPath)) {
    const config = fs.readFileSync(configPath, 'utf8');
    for (const match of config.matchAll(/^\s*project_id\s*=\s*["']([^"']+)["']/gm)) {
      refs.add(match[1]);
    }
  }

  const scanTextFiles = (directory, depth = 0) => {
    if (depth > 6 || !fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next') continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        scanTextFiles(entryPath, depth + 1);
      } else if (/\.(?:html?|js|json|toml|ya?ml|env)$/i.test(entry.name)
          && entryPath !== envPath) {
        const content = fs.readFileSync(entryPath, 'utf8');
        for (const match of content.matchAll(/https?:\/\/([a-z0-9-]+)\.supabase\.co/gi)) {
          refs.add(match[1]);
        }
      }
    }
  };
  scanTextFiles(path.join(repoRoot, 'apps'));
  scanTextFiles(path.join(repoRoot, 'supabase'));
  return refs;
}

export function loadDevConfig() {
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.test is missing.');
  }
  const env = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
  const supabaseUrl = env.get('SUPABASE_URL');
  const anonKey = env.get('SUPABASE_ANON_KEY');
  const databaseUrl = env.get('DATABASE_URL');
  if (!supabaseUrl || !anonKey || !databaseUrl
      || /YOUR-|<|>/.test(`${supabaseUrl}${anonKey}${databaseUrl}`)) {
    throw new Error('.env.test is missing required dev project settings.');
  }

  let supabase;
  let database;
  try {
    supabase = new URL(supabaseUrl);
    database = new URL(databaseUrl);
  } catch {
    throw new Error('.env.test contains an invalid project URL or database URL.');
  }
  if (supabase.protocol !== 'https:' || !supabase.hostname.endsWith('.supabase.co')) {
    throw new Error('The configured Supabase URL is not a hosted HTTPS project.');
  }

  const projectRef = supabase.hostname.slice(0, -'.supabase.co'.length);
  const dbUsername = decodeURIComponent(database.username);
  if (!dbUsername.endsWith(`.${projectRef}`)) {
    throw new Error('The database username does not match the Supabase URL project.');
  }
  if (database.protocol !== 'postgres:' && database.protocol !== 'postgresql:') {
    throw new Error('The database URL is not a PostgreSQL connection URL.');
  }

  const repoRefs = collectProjectRefs();
  if (repoRefs.has(projectRef)) {
    throw new Error('Safety guard stopped: .env.test points to a linked or runtime project.');
  }

  return { supabaseUrl: supabase.origin, anonKey, databaseUrl, env };
}

export function createDatabaseClient(databaseUrl) {
  return new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    query_timeout: 120000
  });
}

export function safeError(error, config) {
  let message = error?.message || String(error);
  for (const value of [
    config?.databaseUrl,
    config?.anonKey,
    config?.env?.get('TEST_USER_PASSWORD'),
    config?.env?.get('TEST_USER_A_EMAIL'),
    config?.env?.get('TEST_USER_B_EMAIL'),
    config?.env?.get('TEST_USER_C_EMAIL')
  ]) {
    if (value) message = message.replaceAll(value, '[REDACTED]');
  }
  return message.replace(/(?:postgres(?:ql)?:\/\/)\S+/gi, '[REDACTED DATABASE URL]');
}

export { repoRoot };
