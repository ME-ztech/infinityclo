import type { Metadata } from 'next';
import Link from 'next/link';

import { CarriedOverNotice, PolicyPage, PolicySection } from '@/components/content/PolicyPage';
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Returns',
  description: 'INFNITY refund policy: 10-day returns, exchanges and refunds.',
  alternates: { canonical: '/returns' },
};

const Instagram = () => (
  <a
    href={INSTAGRAM_URL}
    target="_blank"
    rel="noopener noreferrer"
    className="text-fg underline underline-offset-4"
  >
    Instagram {INSTAGRAM_HANDLE}
  </a>
);

/** The store's refund policy as published on infinityclo.ca. */
export default function ReturnsPage() {
  return (
    <PolicyPage title="Returns" note={<CarriedOverNotice />}>
      <PolicySection heading="10-day returns">
        <p>
          We have a 10-day return policy, which means you have 10 days after receiving your item to
          request a return.
        </p>
        <p>
          To be eligible for a return, your item must be in the same condition that you received
          it: unworn or unused, with tags, and in its original packaging. You’ll also need the
          receipt or proof of purchase.
        </p>
      </PolicySection>

      <PolicySection heading="How to start a return">
        <p>
          To start a return, contact us on <Instagram />. Signed-in customers can also send a
          request from{' '}
          <Link href="/account/orders" className="text-fg underline underline-offset-4">
            their orders
          </Link>
          .
        </p>
        <p>
          If your return is accepted, we’ll send you a return shipping label, as well as
          instructions on how and where to send your package. Items sent back to us without first
          requesting a return will not be accepted.
        </p>
      </PolicySection>

      <PolicySection heading="Damages and issues">
        <p>
          Please inspect your order upon reception and contact us immediately if the item is
          defective, damaged or if you receive the wrong item, so that we can evaluate the issue
          and make it right.
        </p>
      </PolicySection>

      <PolicySection heading="Exceptions">
        <p>Unfortunately, we cannot accept returns on sale items or gift cards.</p>
        <p>Please get in touch if you have questions or concerns about your specific item.</p>
      </PolicySection>

      <PolicySection heading="Exchanges">
        <p>
          The fastest way to ensure you get what you want is to return the item you have, and once
          the return is accepted, make a separate purchase for the new item.
        </p>
      </PolicySection>

      <PolicySection heading="Refunds">
        <p>
          We will notify you once we’ve received and inspected your return, and let you know if the
          refund was approved or not. If approved, you’ll be automatically refunded on your
          original payment method. Please remember it can take some time for your bank or credit
          card company to process and post the refund too.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
