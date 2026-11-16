import 'server-only';

import { sql } from 'drizzle-orm';

import { getDb } from '@/server/db/client';

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly count: number;
  readonly limit: number;
}

/**
 * Fixed-window limiter stored in the app database, so it holds across
 * serverless instances. One atomic upsert per call: the window resets in the
 * same statement that increments it, so two concurrent requests cannot both
 * see a fresh window.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const db = await getDb();
  const result = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   THEN now() ELSE rate_limits.window_start END
    RETURNING count
  `);
  const count = Number(result.rows[0]?.count ?? limit + 1);
  return { allowed: count <= limit, count, limit };
}
