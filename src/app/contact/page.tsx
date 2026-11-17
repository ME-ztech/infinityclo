import type { Metadata } from 'next';
import Link from 'next/link';

import { ContactForm } from '@/components/content/ContactForm';
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '@/lib/site';
import { getSiteContent } from '@/server/cms';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with INFNITY about an order, a return, sizing or anything else.',
  alternates: { canonical: '/contact' },
};

export const revalidate = 60;

/**
 * Contact.
 *
 * Only verified contact details are shown: the brand's Instagram, and whatever
 * the owner has entered in admin (an email address and a short note). No
 * address, phone number or response time is stated unless the owner adds it.
 */
export default async function ContactPage() {
  const { contact, social } = await getSiteContent();
  const instagram = social.instagram || INSTAGRAM_URL;

  return (
    <div className="edge pt-12 pb-(--spacing-section) md:pt-20">
      <header className="mx-auto mb-12 max-w-2xl text-center">
        <h1 className="font-display text-headline text-fg">Contact us</h1>
        <p className="text-fg-muted mt-5 text-sm leading-relaxed">
          Questions about a piece, an order or a return.
        </p>
      </header>

      <div className="mx-auto grid max-w-4xl gap-12 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
        <div className="flex flex-col gap-7">
          <div>
            <h2 className="text-fg-faint text-[0.68rem] font-semibold tracking-[0.2em] uppercase">
              Instagram
            </h2>
            <a
              href={instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg mt-1 flex min-h-11 items-center text-base font-semibold underline underline-offset-4"
            >
              {INSTAGRAM_HANDLE}
            </a>
          </div>

          {contact.email && (
            <div>
              <h2 className="text-fg-faint text-[0.68rem] font-semibold tracking-[0.2em] uppercase">
                Email
              </h2>
              <a
                href={`mailto:${contact.email}`}
                className="text-fg mt-1 flex min-h-11 items-center text-base font-semibold break-all underline underline-offset-4"
              >
                {contact.email}
              </a>
            </div>
          )}

          {contact.note && <p className="text-fg-muted text-sm leading-relaxed">{contact.note}</p>}

          <p className="text-fg-muted text-sm leading-relaxed">
            Quick answers are in the{' '}
            <Link href="/faq" className="text-fg underline underline-offset-4">
              FAQ
            </Link>
            , the{' '}
            <Link href="/shipping" className="text-fg underline underline-offset-4">
              shipping
            </Link>{' '}
            and{' '}
            <Link href="/returns" className="text-fg underline underline-offset-4">
              returns
            </Link>{' '}
            policies, and the{' '}
            <Link href="/size-guide" className="text-fg underline underline-offset-4">
              size guide
            </Link>
            .
          </p>
        </div>

        <ContactForm />
      </div>
    </div>
  );
}
