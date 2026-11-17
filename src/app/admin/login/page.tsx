import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { BrandLogo } from '@/components/ui/Wordmark';
import { getStaffSession } from '@/server/auth/staff';

import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Staff sign in',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await getStaffSession().catch(() => null)) redirect('/admin');
  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-100 p-6">
      <div className="border-line w-full max-w-sm border bg-white p-8">
        <BrandLogo compact />
        <h1 className="mt-6 text-xl font-bold">Back office</h1>
        <p className="mt-1 mb-6 text-sm text-neutral-600">
          Staff only. Every action is recorded in the audit log.
        </p>
        <LoginForm next={next ?? '/admin'} />
      </div>
    </main>
  );
}
