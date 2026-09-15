import { createPostgresCatalog } from './postgres-catalog.js';

function validatedConnectionString(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') return null;
    if (!url.username || !url.password || !url.hostname || !url.pathname || url.pathname === '/') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export async function createPostgresCatalogFromEnv({
  env = {},
  importPg = () => import('pg')
} = {}) {
  const raw = env?.AUCTION_DATABASE_URL;
  if (raw == null || String(raw).trim() === '') return null;

  const connectionString = validatedConnectionString(raw);
  if (!connectionString) throw new Error('invalid_database_url');

  const pg = await importPg();
  const Pool = pg?.Pool ?? pg?.default?.Pool;
  if (typeof Pool !== 'function') throw new Error('database_driver_unavailable');

  const pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true
  });

  return createPostgresCatalog({ pool });
}
