import Link from 'next/link';

import { Wordmark } from '@/components/ui/Wordmark';
import { BRAND, FOOTER_NAV } from '@/lib/site';

export interface FooterSocial {
  readonly label: string;
  readonly href: string;
}

/**
 * Footer.
 *
 * White, like the rest of the store, and closed off with a single ink rule. It
 * carries every policy and account link, and only the social links that are
 * actually configured — an empty one is omitted, never rendered as a dead icon.
 */
export function Footer({ social = [] }: { social?: readonly FooterSocial[] }) {
  return (
    <footer data-surface="paper" className="bg-surface text-fg border-fg border-t">
      <div className="edge py-14 md:py-20">
        <div className="flex flex-col items-center text-center">
          <Wordmark withEmblem emblemClassName="h-10" className="text-2xl" />
          <p className="text-fg-muted mt-4 text-[0.7rem] font-semibold tracking-[0.3em] uppercase">
            {BRAND.tagline}
          </p>
        </div>

        <nav
          aria-label="Footer"
          className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4"
        >
          {FOOTER_NAV.map((group) => (
            <div key={group.heading}>
              <h2 className="text-fg text-[0.66rem] font-semibold tracking-[0.24em] uppercase">
                {group.heading}
              </h2>
              <ul className="mt-3 flex flex-col">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-fg-muted hover:text-fg flex min-h-10 items-center text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-line mt-12 flex flex-col items-center gap-3 border-t pt-8 text-center">
          {social.length > 0 && (
            <ul className="flex flex-wrap items-center justify-center gap-x-7">
              {social.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-fg hover:text-fg-muted flex min-h-11 items-center text-[0.68rem] font-semibold tracking-[0.2em] uppercase transition-colors"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="text-fg-faint text-[0.68rem] tracking-[0.1em]">
            Prices in CAD · Winnipeg, Manitoba, Canada
          </p>
          <p className="text-fg-faint text-[0.68rem] tracking-[0.1em]">
            © {new Date().getFullYear()} {BRAND.legalName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
