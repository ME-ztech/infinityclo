/**
 * Database connection.
 *
 * `DATABASE_URL` selects the engine:
 *
 *   postgres://… / postgresql://…   PostgreSQL (Neon, RDS, local) via `pg`.
 *   pglite://<directory>            Embedded PostgreSQL, persisted to a folder.
 *   pglite://memory                 Embedded PostgreSQL, in memory (tests).
 *
 * Unset: development falls back to `pglite://.data/pglite` so the platform runs
 * with no setup; production refuses to guess and reports "not configured".
 *
 * PGlite is real PostgreSQL compiled to WebAssembly, so development and the
 * test suite execute the same SQL, constraints and transactions as production.
 * It is single-connection and is not a production database.
 */
import 'server-only';

import path from 'node:path';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from './schema';

/** One query surface for both engines. */
export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Anything a query can run on: the database or an open transaction. */
export type Executor = Database | Transaction;

export type DatabaseEngine = 'postgres' | 'pglite';

interface Connection {
  readonly db: Database;
  readonly engine: DatabaseEngine;
  readonly migrate: (folder: string) => Promise<void>;
  readonly close: () => Promise<void>;
}

const globalDb = globalThis as typeof globalThis & { __infnityDb?: Promise<Connection> | null };

export function databaseUrl(): string | null {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') return null;
  return 'pglite://.data/pglite';
}

export function isDatabaseConfigured(): boolean {
  return databaseUrl() !== null;
}

async function connect(url: string): Promise<Connection> {
  if (url.startsWith('pglite://')) {
    const target = url.slice('pglite://'.length);
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    let client: InstanceType<typeof PGlite>;
    if (target === 'memory') {
      client = new PGlite();
    } else {
      const directory = path.resolve(/* turbopackIgnore: true */ process.cwd(), target);
      const { mkdir } = await import('node:fs/promises');
      await mkdir(path.dirname(directory), { recursive: true });
      client = new PGlite(directory);
    }
    const db = drizzle(client, { schema });
    return {
      db: db as unknown as Database,
      engine: 'pglite',
      migrate: (folder) => migrate(db, { migrationsFolder: folder }),
      close: () => client.close(),
    };
  }

  const { Pool } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    // Hosted Postgres requires TLS; a local server does not offer it.
    ssl: /localhost|127\.0\.0\.1/.test(url) || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: true },
  });
  const db = drizzle(pool, { schema });
  return {
    db,
    engine: 'postgres',
    migrate: (folder) => migrate(db, { migrationsFolder: folder }),
    close: () => pool.end(),
  };
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('The commerce database is not configured. Set DATABASE_URL.');
    this.name = 'DatabaseNotConfiguredError';
  }
}

function connection(): Promise<Connection> {
  if (!globalDb.__infnityDb) {
    const url = databaseUrl();
    if (!url) throw new DatabaseNotConfiguredError();
    globalDb.__infnityDb = connect(url).then(async (conn) => {
      // The embedded engine is created empty; bring it to the current schema.
      // A real PostgreSQL is migrated deliberately, by `npm run db:migrate`.
      if (conn.engine === 'pglite') await conn.migrate(migrationsFolder());
      return conn;
    });
    globalDb.__infnityDb.catch(() => {
      globalDb.__infnityDb = null;
    });
  }
  return globalDb.__infnityDb;
}

export const migrationsFolder = (): string => path.resolve(/* turbopackIgnore: true */ process.cwd(), 'drizzle');

export async function getDb(): Promise<Database> {
  return (await connection()).db;
}

export async function databaseEngine(): Promise<DatabaseEngine> {
  return (await connection()).engine;
}

export async function runMigrations(): Promise<void> {
  const conn = await connection();
  await conn.migrate(migrationsFolder());
}

export async function closeDb(): Promise<void> {
  const pending = globalDb.__infnityDb;
  globalDb.__infnityDb = null;
  if (pending) await (await pending).close();
}

/** Tests: a fresh in-memory PostgreSQL, fully migrated. */
export async function useMemoryDatabaseForTesting(): Promise<Database> {
  const existing = globalDb.__infnityDb ? await globalDb.__infnityDb.catch(() => null) : null;
  if (existing && memoryConnection === existing) {
    // Same engine, clean slate: far quicker than booting a new database per test.
    const { sql } = await import('drizzle-orm');
    const tables = await existing.db.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const names = tables.rows.map((row) => `"${row.tablename}"`).join(', ');
    if (names) await existing.db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
    return existing.db;
  }
  await closeDb().catch(() => undefined);
  globalDb.__infnityDb = connect('pglite://memory').then(async (conn) => {
    await conn.migrate(migrationsFolder());
    memoryConnection = conn;
    return conn;
  });
  return (await globalDb.__infnityDb).db;
}

let memoryConnection: Connection | null = null;

export { schema };
