/**
 * Creates the first back-office Owner account.
 *
 *   OWNER_EMAIL=you@example.com OWNER_NAME="Your Name" npm run admin:create-owner
 *
 * Uses DATABASE_URL (or local PGlite). If OWNER_PASSWORD is not set, a strong
 * random password is generated and printed ONCE — change it after signing in.
 * Refuses to run if an owner already exists.
 */
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

// `server-only` throws outside Next's server bundle; this CLI is server-side by definition.
const require = createRequire(import.meta.url);
const serverOnly = require.resolve('server-only');
require.cache[serverOnly] = {
  id: serverOnly,
  filename: serverOnly,
  loaded: true,
  exports: {},
} as NodeJS.Module;

async function main() {
  const { createStaffUser, listStaff, passwordProblem } = await import('../src/server/auth/staff');
  const email = process.env.OWNER_EMAIL;
  const name = process.env.OWNER_NAME ?? 'Owner';
  if (!email) {
    console.error('Set OWNER_EMAIL (and optionally OWNER_NAME, OWNER_PASSWORD).');
    process.exit(1);
  }
  const existing = await listStaff();
  if (existing.some((member) => member.role === 'owner' && member.active)) {
    console.error('An active owner already exists. Use Admin → Settings → Staff to add people.');
    process.exit(1);
  }
  const generated = !process.env.OWNER_PASSWORD;
  const password = process.env.OWNER_PASSWORD ?? `${randomBytes(12).toString('base64url')}9a`;
  const problem = passwordProblem(password);
  if (problem) {
    console.error(`OWNER_PASSWORD: ${problem}`);
    process.exit(1);
  }
  await createStaffUser({ email, name, role: 'owner', password }, null);
  console.log(`Owner ${email} created.`);
  if (generated) console.log(`Temporary password (shown once): ${password}`);
  process.exit(0);
}

void main();
