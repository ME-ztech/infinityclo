import Link from 'next/link';

import { cn } from '@/lib/cn';

export function SectionHeading({
  eyebrow,
  title,
  href,
  linkLabel = 'View all',
  className,
}: {
  eyebrow?: string;
  title: string;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-end justify-between gap-6', className)}>
      <div>
        {eyebrow && (
          <p className="text-dim mb-3 text-[0.68rem] font-semibold tracking-[0.24em] uppercase">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-headline text-paper text-balance">{title}</h2>
      </div>

      {href && (
        <Link
          href={href}
          className="text-bone hover:text-paper hidden shrink-0 pb-2 text-[0.7rem] font-semibold tracking-[0.16em] uppercase underline underline-offset-4 sm:block"
        >
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
