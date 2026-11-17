import Link from 'next/link';

import { BrandMark, Wordmark } from '@/components/ui/Wordmark';
import type { StoreSettings } from '@/domain/settings';
import { FOOTER_NAV, LEGAL_NAV, SOCIAL_LINKS } from '@/lib/site';

/**
 * Footer: the brand block, the full link set the brief asks for (shop, story,
 * contact, sizing, account, order tracking, shipping, returns, privacy, terms,
 * social) and the store's market. Contact details come from Admin → Settings,
 * which defaults to what the merchant already publishes on infinityclo.ca.
 */
export function Footer({ settings }: { settings: StoreSettings }) {
  const socials = [
    ...SOCIAL_LINKS,
    ...(settings.facebookUrl ? [{ label: 'Facebook', href: settings.facebookUrl }] : []),
  ];
  return (
    <footer data-surface="void" className="bg-surface text-fg">
      <div className="edge py-16 md:py-20">
        <div className="grid gap-14 lg:grid-cols-[1fr_2.2fr] lg:gap-20">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <BrandMark className="h-14" />
            <p className="font-display mt-6 text-[clamp(1.8rem,4vw,2.6rem)] leading-[0.95]">Be the Statement</p>
            <p className="text-fg-muted mt-4 max-w-xs text-sm leading-relaxed">
              Streetwear for the ones who don’t fold, don’t follow — and never settle.
            </p>
            <address className="text-fg-muted mt-6 flex flex-col gap-1 text-sm not-italic">
              {settings.publicEmail && (
                <a href={`mailto:${settings.publicEmail}`} className="hover:text-fg underline-offset-4 hover:underline">
                  {settings.publicEmail}
                </a>
              )}
              {settings.publicPhone && (
                <a href={`tel:${settings.publicPhone.replace(/[^\d+]/g, '')}`} className="hover:text-fg">
                  {settings.publicPhone}
                </a>
              )}
            </address>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {FOOTER_NAV.map((group) => (
              <div key={group.heading}>
                <h2 className="text-fg-faint text-[0.64rem] font-semibold tracking-[0.24em] uppercase">{group.heading}</h2>
                <ul className="mt-5 flex flex-col gap-1">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-fg-muted hover:text-fg flex min-h-9 items-center text-sm transition-colors">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="border-line mt-14 flex flex-col items-center gap-6 border-t pt-10 text-center md:flex-row md:justify-between md:text-left">
          <Wordmark className="text-2xl" />
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {socials.map((social) => (
              <li key={social.href}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-fg-muted hover:text-fg flex min-h-11 items-center text-[0.7rem] tracking-[0.2em] uppercase transition-colors"
                >
                  {social.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="text-fg-faint mt-6 flex flex-col items-center gap-4 text-[0.68rem] tracking-[0.08em] md:flex-row md:justify-between">
          <p>
            © {new Date().getFullYear()} {settings.tradeName} · Canada · Prices in CAD
          </p>
          <ul className="flex flex-wrap justify-center gap-x-5">
            {LEGAL_NAV.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-fg flex min-h-11 items-center uppercase transition-colors">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
