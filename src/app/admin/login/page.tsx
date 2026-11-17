import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Button, Flash, TextField } from '@/components/admin/ui';
import { getSession, loginReadiness } from '@/server/admin/auth';
import type { SearchParams } from '@/server/admin/page';

import { loginAction } from '../actions/auth';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function AdminLoginPage({ searchParams }: { searchParams: SearchParams }) {
  if (await getSession()) redirect('/admin');
  const params = await searchParams;
  const readiness = loginReadiness();

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-12">
      <p className="text-xs font-bold tracking-[0.2em] text-neutral-600 uppercase">INFNITY</p>
      <h1 className="mt-1 mb-6 text-3xl font-black tracking-tight uppercase">Back office</h1>
      <Flash params={params} />

      {!readiness.ready ? (
        <div
          className="border border-amber-600 bg-amber-50 p-5 text-sm leading-relaxed text-amber-950"
          data-testid="login-not-configured"
        >
          <h2 className="font-black uppercase">Sign-in is not set up yet</h2>
          <p className="mt-2">This deployment is missing:</p>
          <ul className="mt-1 list-disc pl-5 font-mono text-xs">
            {readiness.missing.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <p className="mt-3">
            On your own machine, run <code className="font-mono font-bold">npm run admin:setup -- you@example.com</code>.
            It generates a strong password, its hash and a session secret, writes them to{' '}
            <code className="font-mono">.env.local</code>, and shows the password once. On a hosted deployment, add the
            same three variables in the host’s environment settings. There is no default password.
          </p>
        </div>
      ) : (
        <form action={loginAction} className="flex flex-col gap-4 border border-neutral-200 bg-white p-5">
          <TextField label="Email" name="email" type="email" autoComplete="username" required data-testid="login-email" />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="login-password"
          />
          <Button testId="login-submit">Sign in</Button>
          <p className="text-xs leading-relaxed text-neutral-600">
            Five attempts per 15 minutes. Sessions end after 8 hours. Staff accounts are created by the Owner in
            Settings.
          </p>
        </form>
      )}
    </div>
  );
}
