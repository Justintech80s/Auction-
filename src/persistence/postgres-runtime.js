import { createPostgresCatalog } from './postgres-catalog.js';
import { createPagePriceObservationStore } from './page-price-observations.js';

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

function boundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
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

  // Keep persistence optional and fail fast. Live product search must never wait
  // on a slow/paused Postgres/Supabase project.
  const pool = new Pool({
    connectionString,
    max: boundedInt(env?.AUCTION_DB_POOL_MAX, 3, 1, 10),
    idleTimeoutMillis: boundedInt(env?.AUCTION_DB_IDLE_TIMEOUT_MS, 5_000, 1_000, 30_000),
    connectionTimeoutMillis: boundedInt(env?.AUCTION_DB_CONNECT_TIMEOUT_MS, 1_500, 250, 5_000),
    allowExitOnIdle: true
  });

  const catalog = createPostgresCatalog({ pool });
  const observations = createPagePriceObservationStore({ pool });
  return Object.freeze({
    persistScanResult: catalog.persistScanResult.bind(catalog),
    persistPageObservation: observations.persistPageObservation.bind(observations),
    getPriceHistory: observations.getPriceHistory.bind(observations)
  });
}
