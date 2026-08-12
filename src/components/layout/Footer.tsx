import Link from 'next/link';

import { NewsletterForm } from '@/components/newsletter/NewsletterForm';
import { Wordmark } from '@/components/ui/Wordmark';
import { BRAND, FOOTER_NAV, LEGAL_NAV, SOCIAL_LINKS } from '@/lib/site';

/**
 * The last room.
 *
 * Void, deliberately. After a scroll that ends on light surfaces, the page
 * closing on true black gives the sequence a floor — and it is where the
 * newsletter lives, which is the one thing on this page that should feel like a
 * decision rather than a browse.
 */
export function Footer() {
  return (
    <footer data-surface="void" className="bg-surface text-fg">
      <div className="edge py-16 md:py-24">
        <div className="grid gap-14 lg:grid-cols-[1.1fr_2fr] lg:gap-20">
          <div className="max-w-md">
            <div className="mb-6 flex items-center gap-4">
              <span aria-hidden className="bg-signal h-px w-10" />
              <p className="text-fg-faint text-[0.66rem] font-semibold tracking-[0.32em] uppercase">
                Mailing list
              </p>
            </div>
            <p className="font-display text-fg oblique text-[clamp(1.9rem,5vw,3rem)] leading-[0.95]">
              Join the Troop
            </p>
            <p className="text-fg-muted mt-4 text-sm leading-relaxed">
              Early access. Private drops. Restocks. No noise.
            </p>
            <NewsletterForm source="footer" className="mt-7" />
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {FOOTER_NAV.map((group) => (
              <div key={group.heading}>
                <h2 className="text-fg-faint text-[0.64rem] font-semibold tracking-[0.24em] uppercase">
                  {group.heading}
                </h2>
                <ul className="mt-5 flex flex-col gap-3">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-fg-muted hover:text-fg text-sm transition-colors"
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

        <div className="border-line mt-16 flex flex-col gap-7 border-t pt-10 md:flex-row md:items-center md:justify-between">
          <Wordmark className="text-2xl" />

          <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
            {/* Social links render only once real handles are confirmed —
                see docs/OPERATIONS_CONTENT_GAPS.md. */}
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.href}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-fg-faint hover:text-fg text-[0.66rem] tracking-[0.2em] uppercase transition-colors"
              >
                {social.label}
              </a>
            ))}
            {LEGAL_NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-fg-faint hover:text-fg text-[0.66rem] tracking-[0.2em] uppercase transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <p className="text-fg-faint mt-9 text-[0.66rem] tracking-[0.1em]">
          © {new Date().getFullYear()} {BRAND.legalName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
