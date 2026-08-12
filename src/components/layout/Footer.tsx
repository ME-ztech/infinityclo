import Link from 'next/link';

import { NewsletterForm } from '@/components/newsletter/NewsletterForm';
import { Wordmark } from '@/components/ui/Wordmark';
import { BRAND, FOOTER_NAV, LEGAL_NAV, SOCIAL_LINKS } from '@/lib/site';

export function Footer() {
  return (
    <footer className="border-ash/50 bg-ink mt-[--spacing-section] border-t">
      <div className="edge py-16 md:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div className="max-w-md">
            <p className="font-display text-headline text-paper">Join the Troop</p>
            <p className="text-smoke mt-4 text-sm leading-relaxed">
              Early access. Private drops. Restocks. No noise.
            </p>
            <NewsletterForm source="footer" className="mt-6" />
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {FOOTER_NAV.map((group) => (
              <div key={group.heading}>
                <h2 className="text-dim text-[0.68rem] font-semibold tracking-[0.18em] uppercase">
                  {group.heading}
                </h2>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-bone/90 hover:text-paper text-sm transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="border-ash/40 mt-14 flex flex-col gap-6 border-t pt-8 md:flex-row md:items-center md:justify-between">
          <Wordmark className="text-2xl" />

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {/* Social links render only once real handles are confirmed —
                see docs/OPERATIONS_CONTENT_GAPS.md. */}
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.href}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-smoke hover:text-paper text-[0.68rem] tracking-[0.16em] uppercase"
              >
                {social.label}
              </a>
            ))}
            {LEGAL_NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-smoke hover:text-paper text-[0.68rem] tracking-[0.16em] uppercase"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <p className="text-dim mt-8 text-[0.68rem] tracking-[0.08em]">
          © {new Date().getFullYear()} {BRAND.legalName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
