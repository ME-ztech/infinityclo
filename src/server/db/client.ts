import 'server-only';

import path from 'node:path';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from './schema';

/**
 * Database access.
 *
 * - `DATABASE_URL` set  → PostgreSQL via node-postgres (production, staging).
 * - unset               → PGlite, an in-process Postgres (local development,
 *   tests, and *ephemeral* previews). Same SQL dialect, same migrations.
 *
 * PGlite on a serverless host is per-instance and lost on cold start, so a
 * production deployment without `DATABASE_URL` refuses to run app-DB features
 * instead of silently losing a customer's consent record.
 */
export type Db = NodePgDatabase<typeof schema>;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      'DATABASE_URL is not set. Production deployments require a durable PostgreSQL database for ' +
        'CMS, promotions, consent records, community moderation and staff accounts.',
    );
    this.name = 'DatabaseNotConfiguredError';
  }
}

export type DatabaseKind = 'postgres' | 'pglite-file' | 'pglite-memory';

interface DbState {
  promise: Promise<Db> | null;
  kind: DatabaseKind | null;
}

const globalState = globalThis as unknown as { __infnityDb?: DbState };
const state: DbState = (globalState.__infnityDb ??= { promise: null, kind: null });

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'src', 'server', 'db', 'migrations');

export function databaseKind(): DatabaseKind {
  if (process.env.DATABASE_URL) return 'postgres';
  return pgliteDir() === 'memory://' ? 'pglite-memory' : 'pglite-file';
}

/** True when data survives restarts and is shared by every server instance. */
export function isDatabaseDurable(): boolean {
  return databaseKind() === 'postgres';
}

function pgliteDir(): string {
  if (process.env.PGLITE_DATA_DIR) return process.env.PGLITE_DATA_DIR;
  if (process.env.VITEST) return 'memory://';
  if (process.env.VERCEL) return '/tmp/infnity-pglite';
  return path.join(process.cwd(), '.data', 'pglite');
}

async function connect(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      ssl: /sslmode=disable/.test(process.env.DATABASE_URL) ? undefined : { rejectUnauthorized: true },
    });
    const db = drizzle(pool, { schema });
    // Serialise concurrent cold starts so two instances never race a migration.
    const client = await pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock(727274)');
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    } finally {
      await client.query('SELECT pg_advisory_unlock(727274)').catch(() => undefined);
      client.release();
    }
    state.kind = 'postgres';
    return db;
  }

  if (process.env.VERCEL_ENV === 'production' || process.env.REQUIRE_DURABLE_DB === 'true') {
    throw new DatabaseNotConfiguredError();
  }

  // `next build` pre-renders in several worker processes at once; an on-disk
  // PGlite directory must not be opened concurrently. Pages fall back to their
  // defaults at build time and pick up stored content on the first ISR render.
  if (process.env.NEXT_PHASE === 'phase-production-build' && pgliteDir() !== 'memory://') {
    throw new Error('No database during build (PGlite is single-process); using defaults.');
  }

  const dir = pgliteDir();
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  if (dir !== 'memory://') {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dir, { recursive: true });
  }
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  state.kind = dir === 'memory://' ? 'pglite-memory' : 'pglite-file';
  return db as unknown as Db;
}

export function getDb(): Promise<Db> {
  if (!state.promise) {
    state.promise = connect().catch((error: unknown) => {
      // Do not cache a failed connection; the next request retries.
      state.promise = null;
      throw error;
    });
  }
  return state.promise;
}

/** Test helper: drop the cached connection so each suite gets a fresh in-memory DB. */
export function resetDbForTests(): void {
  state.promise = null;
  state.kind = null;
}

export { schema };
