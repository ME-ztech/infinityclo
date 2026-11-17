import { defineConfig } from 'drizzle-kit';

/**
 * Migration generation only (`npm run db:generate`). Migrations are applied by
 * the application's own runner (`npm run db:migrate`), which works against both
 * PostgreSQL and the embedded development database.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
});
