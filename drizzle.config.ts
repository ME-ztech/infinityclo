import { defineConfig } from 'drizzle-kit';

/** `npm run db:generate` writes SQL migrations; they are applied at runtime by src/server/db/client.ts. */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
});
