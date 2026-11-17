import type { Metadata } from 'next';
import Link from 'next/link';

import { PolicyPage } from '@/components/content/PolicyPage';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Orders, shipping, returns and sizing at INFNITY.',
  alternates: { canonical: '/faq' },
};

/** Every answer restates the store's published policies or links to them. */
const QUESTIONS: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: 'How long does shipping take?',
    a: (
      <>
        Orders take 2–3 business days to process, then 3–5 business days to ship to your destination. See the{' '}
        <Link href="/shipping" className="text-fg underline underline-offset-4">shipping policy</Link>.
      </>
    ),
  },
  {
    q: 'Can I return something?',
    a: (
      <>
        Yes — within 10 days of receiving it, unworn and unused, with tags and in its original packaging. Sale items and gift cards are final. Start
        from the <Link href="/contact?topic=return" className="text-fg underline underline-offset-4">contact form</Link> or DM @infnity.clo, and
        wait for our reply before sending anything back. Full terms on the{' '}
        <Link href="/returns" className="text-fg underline underline-offset-4">returns page</Link>.
      </>
    ),
  },
  {
    q: 'Can I exchange a size?',
    a: 'The fastest way is to return the item you have and, once the return is accepted, place a new order for the size you want.',
  },
  {
    q: 'How do I find my size?',
    a: (
      <>
        Garment measurements published by INFNITY are on the <Link href="/size-guide" className="text-fg underline underline-offset-4">size guide</Link>.
        Many product pages also say what size the model is wearing.
      </>
    ),
  },
  {
    q: 'Where is my order?',
    a: (
      <>
        Sign in under <Link href="/account/orders" className="text-fg underline underline-offset-4">Account → Orders</Link> to see status and tracking.
        Shopify also emails tracking when your order ships.
      </>
    ),
  },
  { q: 'Do I need an account to order?', a: 'No — guest checkout is always available. An account lets you see your order history and tracking.' },
  { q: 'Which currency are prices in?', a: 'Canadian dollars (CAD). Taxes and shipping are calculated at checkout.' },
];

export default function FaqPage() {
  return (
    <PolicyPage title="FAQ" intro="Answers based on our published store policies.">
      <div className="border-line border-t">
        {QUESTIONS.map((item) => (
          <details key={item.q} className="border-line group border-b">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between py-4 text-[0.95rem] font-medium [&::-webkit-details-marker]:hidden">
              {item.q}
              <span aria-hidden className="ml-4 text-2xl leading-none font-light transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="text-fg-muted pb-5 text-sm leading-relaxed">{item.a}</div>
          </details>
        ))}
      </div>
    </PolicyPage>
  );
}
