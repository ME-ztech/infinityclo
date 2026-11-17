import Link from 'next/link';

export const metadata = { title: 'Not permitted', robots: { index: false } };

export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-100 p-6">
      <div className="border-line max-w-md border bg-white p-8 text-center">
        <h1 className="text-xl font-bold">Not permitted</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Your role doesn’t include {p ? <code>{p}</code> : 'this area'}. Ask the owner if you need
          it.
        </p>
        <Link href="/admin" className="mt-6 inline-block text-sm underline">
          Back to overview
        </Link>
      </div>
    </main>
  );
}
