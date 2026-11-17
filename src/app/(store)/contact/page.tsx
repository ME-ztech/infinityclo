import type { Metadata } from 'next';

import { ContactForm } from '@/components/content/ContactForm';
import { getSettings } from '@/server/content/cms';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contact INFNITY — questions, orders, returns and exchanges.',
  alternates: { canonical: '/contact' },
};

export const revalidate = 300;

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; order?: string }>;
}) {
  const [settings, params] = await Promise.all([getSettings(), searchParams]);
  return (
    <div className="edge pt-14 pb-(--spacing-section) md:pt-20">
      <header className="mx-auto mb-12 max-w-xl text-center">
        <h1 className="font-display text-[clamp(2.4rem,7vw,4rem)] leading-[0.9]">Contact us</h1>
        <p className="text-fg-muted mt-5 text-sm leading-relaxed">
          Questions about a piece, an order, a return or an exchange — send it here and a real
          person replies.
        </p>
      </header>
      <div className="mx-auto grid max-w-4xl gap-12 md:grid-cols-[1fr_1.3fr] md:gap-16">
        <aside className="text-center md:text-left">
          <h2 className="text-fg-faint text-[0.66rem] font-semibold tracking-[0.24em] uppercase">
            Reach us directly
          </h2>
          <ul className="text-fg-muted mt-4 flex flex-col gap-2 text-sm">
            {settings.publicEmail && (
              <li>
                <a
                  href={`mailto:${settings.publicEmail}`}
                  className="text-fg underline underline-offset-4"
                >
                  {settings.publicEmail}
                </a>
              </li>
            )}
            {settings.publicPhone && <li>{settings.publicPhone}</li>}
            {settings.instagramHandle && (
              <li>
                Instagram:{' '}
                <a
                  href={`https://www.instagram.com/${settings.instagramHandle}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-fg underline underline-offset-4"
                >
                  @{settings.instagramHandle}
                </a>
              </li>
            )}
          </ul>
          <p className="text-fg-faint mt-6 text-xs leading-relaxed">
            Signed in? Your orders and tracking are under Account → Orders.
          </p>
        </aside>
        <ContactForm defaultKind={params.topic ?? 'contact'} defaultOrder={params.order ?? ''} />
      </div>
    </div>
  );
}
