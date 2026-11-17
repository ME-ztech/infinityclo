import { rm } from 'node:fs/promises';
import path from 'node:path';

/** Every run starts from an empty throwaway database. */
export default async function globalSetup() {
  await rm(path.join(process.cwd(), '.data', 'e2e-pglite'), { recursive: true, force: true });
}
