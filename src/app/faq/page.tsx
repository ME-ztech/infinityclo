import type { Metadata } from 'next';
import Link from 'next/link';

import { PolicyPage } from '@/components/content/PolicyPage';
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Common questions about INFNITY orders, sizing, shipping and returns.',
  alternates: { canonical: '/faq' },
};

interface Entry {
  id?: string;
  question: string;
  answer: React.ReactNode;
}

const link = 'text-fg underline underline-offset-4';

/**
 * Every answer restates something the store has actually published: its
 * shipping and refund policies, its size charts and how checkout works. Nothing
 * here promises a carrier, a delivery date or a threshold that is not in those
 * sources.
 */
const ENTRIES: Entry[] = [
  {
    question: 'How long does my order take?',
    answer: (
      <>
        Orders take 2–3 business days to process, then 3–5 business days to ship to your
        destination. See the{' '}
        <Link href="/shipping" className={link}>
          shipping policy
        </Link>
        .
      </>
    ),
  },
  {
    question: 'How much are shipping and taxes?',
    answer: (
      <>
        Both are calculated at checkout for your address and shown before you pay. Prices on the
        site are in Canadian dollars (CAD).
      </>
    ),
  },
  {
    id: 'sizing',
    question: 'How do I pick a size?',
    answer: (
      <>
        Products with a published INFNITY size chart have a Size guide link next to the size
        selector. All four charts are also on the{' '}
        <Link href="/size-guide" className={link}>
          size guide
        </Link>{' '}
        page. Measurements are in inches.
      </>
    ),
  },
  {
    question: 'What is your returns policy?',
    answer: (
      <>
        You have 10 days after receiving your item to request a return. It must be unworn, with
        tags, in its original packaging, with proof of purchase. Sale items and gift cards cannot be
        returned. Full details are in the{' '}
        <Link href="/returns" className={link}>
          returns policy
        </Link>
        .
      </>
    ),
  },
  {
    question: 'How do I start a return or exchange?',
    answer: (
      <>
        Message us on{' '}
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className={link}>
          Instagram {INSTAGRAM_HANDLE}
        </a>{' '}
        before sending anything back — items returned without a request are not accepted. For an
        exchange, return the item and place a separate order for the new one.
      </>
    ),
  },
  {
    question: 'Do I need an account to order?',
    answer: (
      <>
        No. You can check out as a guest. An{' '}
        <Link href="/account" className={link}>
          account
        </Link>{' '}
        lets you see your orders and tracking in one place.
      </>
    ),
  },
  {
    question: 'How do I track my order?',
    answer: (
      <>
        Sign in and open{' '}
        <Link href="/account/orders" className={link}>
          your orders
        </Link>
        . Tracking appears there once your order ships with a tracking number.
      </>
    ),
  },
  {
    question: 'How do I get on the Styled By You wall?',
    answer: (
      <>
        Post and tag us {INSTAGRAM_HANDLE}, or send your photo from the{' '}
        <Link href="/community" className={link}>
          Styled By You
        </Link>{' '}
        page. Submissions are reviewed before they appear.
      </>
    ),
  },
];

export default function FAQPage() {
  return (
    <PolicyPage title="FAQ">
      <div className="border-line border-t">
        {ENTRIES.map((entry) => (
          <details key={entry.question} id={entry.id} className="border-line group border-b">
            <summary className="text-fg flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              {entry.question}
              <span
                aria-hidden
                className="text-fg shrink-0 text-xl leading-none transition-transform duration-200 group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <div className="text-fg-muted pb-5 text-sm leading-relaxed">{entry.answer}</div>
          </details>
        ))}
      </div>
    </PolicyPage>
  );
}
