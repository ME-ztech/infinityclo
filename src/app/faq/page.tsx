import type { Metadata } from 'next';
import Link from 'next/link';

import { PendingNotice, PolicyPage } from '@/components/content/PolicyPage';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Common questions about INFNITY orders, sizing and shipping.',
  alternates: { canonical: '/faq' },
};

interface Entry {
  id?: string;
  question: string;
  answer: React.ReactNode;
}

/**
 * Only questions that can be answered truthfully today are answered. The rest
 * carry a pending notice, because a confident wrong answer in an FAQ is the
 * fastest way to create a support problem.
 */
const ENTRIES: Entry[] = [
  {
    question: 'Can I place an order right now?',
    answer: (
      <>
        Not yet. This is a preview build with no payment provider connected, so checkout is disabled
        and nothing can be charged. You can browse the catalog and build a cart.
      </>
    ),
  },
  {
    id: 'sizing',
    question: 'How do INFNITY pieces fit?',
    answer: (
      <PendingNotice>
        Garment measurements have not been confirmed by the brand. Size guides appear on product
        pages as measurements are published — no estimated dimensions have been filled in.
      </PendingNotice>
    ),
  },
  {
    question: 'What are the garments made from?',
    answer: (
      <PendingNotice>
        Material composition and fabric weights are pending confirmation. Where a specification is
        unconfirmed the product page omits it rather than guessing.
      </PendingNotice>
    ),
  },
  {
    question: 'Where do you ship to?',
    answer: (
      <>
        See{' '}
        <Link href="/shipping" className="text-fg underline underline-offset-4">
          shipping
        </Link>
        . Destinations and carriers are still being confirmed.
      </>
    ),
  },
  {
    question: 'What is your returns policy?',
    answer: (
      <>
        See{' '}
        <Link href="/returns" className="text-fg underline underline-offset-4">
          returns
        </Link>
        . The return window and process are still being confirmed.
      </>
    ),
  },
  {
    question: 'Do I need an account?',
    answer: (
      <>No. Accounts are not connected in this build — your cart is kept in your own browser.</>
    ),
  },
  {
    question: 'How do I get featured in The Troop?',
    answer: (
      <>
        Submissions open with the next drop. Join the list from{' '}
        <Link href="/troop" className="text-fg underline underline-offset-4">
          The Troop
        </Link>{' '}
        to hear first.
      </>
    ),
  },
];

export default function FAQPage() {
  return (
    <PolicyPage
      title="FAQ"
      intro="Straight answers. Where something is not settled yet, it says so."
    >
      <div className="border-line border-t">
        {ENTRIES.map((entry) => (
          <details key={entry.question} id={entry.id} className="border-line group border-b">
            <summary className="text-fg-muted hover:text-fg flex cursor-pointer list-none items-start justify-between gap-4 py-5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              {entry.question}
              <span
                aria-hidden
                className="text-fg-faint mt-0.5 shrink-0 text-lg leading-none transition-transform duration-200 group-open:rotate-45"
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
