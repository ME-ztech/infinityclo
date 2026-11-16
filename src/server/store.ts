/**
 * Document store.
 *
 * Shopify is the system of record for commerce. This store holds only what
 * Shopify does not: storefront content, offer drafts, drops and waitlists,
 * newsletter consent records, community submissions, support tickets, staff
 * accounts, the audit log and webhook receipts.
 *
 * Three adapters behind one interface:
 *
 *   kv      Redis-compatible REST store (Vercel KV / Upstash). Durable anywhere.
 *   file    JSON files under DATA_DIR. Durable on a server or a laptop.
 *   memory  Tests only.
 *
 * `putIfAbsent` is the primitive that makes webhook handling and signups
 * idempotent: exactly one caller wins the insert.
 */
import 'server-only';

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from './config';

export type Collection =
  | 'content'
  | 'product-content'
  | 'offers'
  | 'drops'
  | 'waitlist'
  | 'subscribers'
  | 'community'
  | 'tickets'
  | 'returns'
  | 'staff'
  | 'audit'
  | 'webhook-events'
  | 'order-notes'
  | 'sandbox';

export interface DocumentStore {
  readonly kind: 'kv' | 'file' | 'memory';
  /** False when writes may vanish (serverless filesystem). */
  readonly durable: boolean;
  get<T>(collection: Collection, id: string): Promise<T | null>;
  list<T>(collection: Collection): Promise<T[]>;
  put<T>(collection: Collection, id: string, value: T): Promise<void>;
  /** Inserts only when the id is free. Resolves true when this call inserted. */
  putIfAbsent<T>(collection: Collection, id: string, value: T): Promise<boolean>;
  delete(collection: Collection, id: string): Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Memory
 * ------------------------------------------------------------------ */

export class MemoryStore implements DocumentStore {
  readonly kind = 'memory' as const;
  readonly durable = false;
  private readonly data = new Map<string, Map<string, string>>();

  private bucket(collection: Collection): Map<string, string> {
    let bucket = this.data.get(collection);
    if (!bucket) {
      bucket = new Map();
      this.data.set(collection, bucket);
    }
    return bucket;
  }

  async get<T>(collection: Collection, id: string): Promise<T | null> {
    const raw = this.bucket(collection).get(id);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }
  async list<T>(collection: Collection): Promise<T[]> {
    return [...this.bucket(collection).values()].map((raw) => JSON.parse(raw) as T);
  }
  async put<T>(collection: Collection, id: string, value: T): Promise<void> {
    this.bucket(collection).set(id, JSON.stringify(value));
  }
  async putIfAbsent<T>(collection: Collection, id: string, value: T): Promise<boolean> {
    const bucket = this.bucket(collection);
    if (bucket.has(id)) return false;
    bucket.set(id, JSON.stringify(value));
    return true;
  }
  async delete(collection: Collection, id: string): Promise<void> {
    this.bucket(collection).delete(id);
  }
}

/* ------------------------------------------------------------------ *
 * File
 * ------------------------------------------------------------------ */

/**
 * One JSON file per collection. Writes go through a per-collection queue and an
 * atomic rename, so concurrent requests in one process cannot interleave and a
 * crash mid-write cannot leave a truncated file.
 */
export class FileStore implements DocumentStore {
  readonly kind = 'file' as const;
  readonly durable: boolean;
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly directory: string,
    durable = true,
  ) {
    this.durable = durable;
  }

  private file(collection: Collection): string {
    return path.join(this.directory, `${collection}.json`);
  }

  private async read(collection: Collection): Promise<Record<string, unknown>> {
    try {
      return JSON.parse(await readFile(this.file(collection), 'utf8')) as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  private async write(collection: Collection, data: Record<string, unknown>): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const target = this.file(collection);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2));
    await rename(temporary, target);
  }

  private mutate<R>(
    collection: Collection,
    change: (data: Record<string, unknown>) => { result: R; dirty: boolean },
  ): Promise<R> {
    const previous = this.queues.get(collection) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const data = await this.read(collection);
        const { result, dirty } = change(data);
        if (dirty) await this.write(collection, data);
        return result;
      });
    this.queues.set(collection, next);
    return next;
  }

  async get<T>(collection: Collection, id: string): Promise<T | null> {
    await this.queues.get(collection)?.catch(() => undefined);
    const data = await this.read(collection);
    return (data[id] as T | undefined) ?? null;
  }
  async list<T>(collection: Collection): Promise<T[]> {
    await this.queues.get(collection)?.catch(() => undefined);
    return Object.values(await this.read(collection)) as T[];
  }
  put<T>(collection: Collection, id: string, value: T): Promise<void> {
    return this.mutate(collection, (data) => {
      data[id] = value;
      return { result: undefined, dirty: true };
    });
  }
  putIfAbsent<T>(collection: Collection, id: string, value: T): Promise<boolean> {
    return this.mutate(collection, (data) => {
      if (id in data) return { result: false, dirty: false };
      data[id] = value;
      return { result: true, dirty: true };
    });
  }
  delete(collection: Collection, id: string): Promise<void> {
    return this.mutate(collection, (data) => {
      const existed = id in data;
      delete data[id];
      return { result: undefined, dirty: existed };
    });
  }
}

/* ------------------------------------------------------------------ *
 * KV (Upstash / Vercel KV REST)
 * ------------------------------------------------------------------ */

/** Each collection is one Redis hash: `infnity:<collection>` -> { id: json }. */
export class KvStore implements DocumentStore {
  readonly kind = 'kv' as const;
  readonly durable = true;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async command<R>(...args: Array<string | number>): Promise<R> {
    const response = await this.fetcher(this.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`KV store responded ${response.status}`);
    const body = (await response.json()) as { result?: R; error?: string };
    if (body.error) throw new Error(`KV store error: ${body.error}`);
    return body.result as R;
  }

  private key(collection: Collection): string {
    return `infnity:${collection}`;
  }

  async get<T>(collection: Collection, id: string): Promise<T | null> {
    const raw = await this.command<string | null>('HGET', this.key(collection), id);
    return raw === null || raw === undefined ? null : (JSON.parse(raw) as T);
  }
  async list<T>(collection: Collection): Promise<T[]> {
    const flat = await this.command<string[] | null>('HGETALL', this.key(collection));
    const values: T[] = [];
    for (let index = 1; index < (flat?.length ?? 0); index += 2) {
      values.push(JSON.parse(flat![index]!) as T);
    }
    return values;
  }
  async put<T>(collection: Collection, id: string, value: T): Promise<void> {
    await this.command('HSET', this.key(collection), id, JSON.stringify(value));
  }
  async putIfAbsent<T>(collection: Collection, id: string, value: T): Promise<boolean> {
    return (await this.command<number>('HSETNX', this.key(collection), id, JSON.stringify(value))) === 1;
  }
  async delete(collection: Collection, id: string): Promise<void> {
    await this.command('HDEL', this.key(collection), id);
  }
}

/* ------------------------------------------------------------------ *
 * Composition
 * ------------------------------------------------------------------ */

const globalStore = globalThis as typeof globalThis & { __infnityStore?: DocumentStore };

export function getStore(): DocumentStore {
  if (globalStore.__infnityStore) return globalStore.__infnityStore;
  const { kvUrl, kvToken, dataDir } = config.storage;
  let store: DocumentStore;
  if (process.env.INFNITY_STORE === 'memory') {
    store = new MemoryStore();
  } else if (kvUrl && kvToken) {
    store = new KvStore(kvUrl, kvToken);
  } else if (process.env.VERCEL) {
    // Serverless: only /tmp is writable and it does not survive the instance.
    store = new FileStore(path.join('/tmp', 'infnity-data'), false);
  } else {
    store = new FileStore(path.resolve(process.cwd(), dataDir));
  }
  globalStore.__infnityStore = store;
  return store;
}

/** Tests swap the store; nothing else should. */
export function setStoreForTesting(store: DocumentStore | null): void {
  globalStore.__infnityStore = store ?? undefined;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}
