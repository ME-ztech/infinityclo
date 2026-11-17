/**
 * Creates the admin Owner account for this environment.
 *
 *   npm run admin:setup -- you@example.com
 *
 * Generates a strong random password, its scrypt hash and a session secret,
 * and appends ADMIN_OWNER_EMAIL, ADMIN_OWNER_PASSWORD_HASH and SESSION_SECRET
 * to `.env.local`. Keys that are already present are left untouched. The
 * password is printed once and stored nowhere — only its hash is written.
 *
 *   npm run admin:setup -- --print-hash
 *
 * Prints only the hash of the password in the ADMIN_NEW_PASSWORD environment
 * variable, for setting a hosted environment's variables by hand.
 *
 * The hash format matches `hashPassword` in src/server/security.ts.
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const hash = (password) => {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
};

const [argument] = process.argv.slice(2);

if (argument === '--print-hash') {
  const password = process.env.ADMIN_NEW_PASSWORD;
  if (!password || password.length < 12) {
    console.error('Set ADMIN_NEW_PASSWORD to a password of at least 12 characters.');
    process.exit(1);
  }
  console.log(hash(password));
  process.exit(0);
}

if (!argument || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(argument)) {
  console.error('Usage: npm run admin:setup -- you@example.com');
  process.exit(1);
}

const file = path.resolve(process.cwd(), '.env.local');
const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
const has = (name) => new RegExp(`^${name}=`, 'm').test(existing);

if (has('ADMIN_OWNER_EMAIL') || has('ADMIN_OWNER_PASSWORD_HASH')) {
  console.error('.env.local already has an owner account. Remove ADMIN_OWNER_EMAIL and ADMIN_OWNER_PASSWORD_HASH from it to create a new one.');
  process.exit(1);
}

const password = randomBytes(18).toString('base64url');
const lines = [
  '',
  '# Admin owner account (created by scripts/admin-setup.mjs). The value below is a hash, not the password.',
  `ADMIN_OWNER_EMAIL=${argument.toLowerCase()}`,
  // Quoted: the hash contains `$`, which some env loaders would expand.
  `ADMIN_OWNER_PASSWORD_HASH='${hash(password)}'`,
];
if (!has('SESSION_SECRET')) lines.push(`SESSION_SECRET=${randomBytes(48).toString('base64url')}`);

writeFileSync(file, `${existing.replace(/\s*$/, '')}\n${lines.join('\n')}\n`, { mode: 0o600 });

console.log(`Owner account written to .env.local for ${argument.toLowerCase()}.`);
console.log('');
console.log(`  Password: ${password}`);
console.log('');
console.log('This is shown once and is not stored anywhere. Save it in a password manager now.');
console.log('Restart the dev server, then sign in at /admin.');
