'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';

/** Countdown to a release time the owner has marked as confirmed. */
export function Countdown({ target, className }: { target: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // Client clock only after hydration, so server and client markup agree.
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  const end = Date.parse(target);
  const date = new Intl.DateTimeFormat('en-CA', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Winnipeg' }).format(end);
  if (now === null) return <p className={cn('text-fg-muted text-sm', className)}>Releases {date}</p>;
  const remaining = Math.max(0, end - now);
  const parts = [
    ['days', Math.floor(remaining / 86_400_000)],
    ['hrs', Math.floor((remaining / 3_600_000) % 24)],
    ['min', Math.floor((remaining / 60_000) % 60)],
    ['sec', Math.floor((remaining / 1000) % 60)],
  ] as const;
  return (
    <div className={className}>
      <div className="flex justify-center gap-4 md:justify-start" aria-hidden>
        {parts.map(([label, value]) => (
          <div key={label} className="text-center">
            <p className="font-display text-3xl tabular-nums">{String(value).padStart(2, '0')}</p>
            <p className="text-fg-faint text-[0.6rem] tracking-[0.2em] uppercase">{label}</p>
          </div>
        ))}
      </div>
      <p className="text-fg-muted mt-2 text-xs">Releases {date} (Central time)</p>
    </div>
  );
}
