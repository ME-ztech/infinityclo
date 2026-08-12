import type { Metadata } from 'next';

import { ContactForm } from '@/components/content/ContactForm';
import { PendingNotice } from '@/components/content/PolicyPage';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with INFNITY.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <div className="edge pt-28 pb-[--spacing-section] md:pt-36">
      <div className="grid gap-12 md:grid-cols-2 md:gap-20">
        <div className="max-w-md">
          <h1 className="font-display text-headline text-paper">Contact</h1>
          <p className="text-smoke mt-5 text-sm leading-relaxed">
            Questions about a piece, an order, or the label itself.
          </p>

          <div className="mt-10 flex flex-col gap-6">
            <PendingNotice>
              A support email address and response time have not been confirmed, so none is
              published here. Messages sent through this form are validated but not yet delivered
              anywhere — see the note below the form.
            </PendingNotice>
          </div>
        </div>

        <div>
          <ContactForm />
        </div>
      </div>
    </div>
  );
}
