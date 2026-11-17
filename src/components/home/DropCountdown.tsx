'use client';

/**
 * Countdown to a drop.
 *
 * Rendered only for a release date the owner has explicitly confirmed. The date
 * itself is printed on the server; the ticking remainder is filled in on the
 * client so the static page and the first client paint agree.
 */
import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';

function remaining(target: number, now: number) {
  const total = Math.max(0, target - now);
  return {
    days: Math.floor(total / 86_400_000),
    hours: Math.floor((total % 86_400_000) / 3_600_000),
    minutes: Math.floor((total % 3_600_000) / 60_000),
    done: total === 0,
  };
}

export function DropCountdown({ releaseAt, className }: { releaseAt: string; className?: string }) {
  const target = Date.parse(releaseAt);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (Number.isNaN(target)) return null;

  const date = new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Winnipeg',
    timeZoneName: 'short',
  }).format(target);

  const left = now === null ? null : remaining(target, now);

  return (
    <div className={cn('text-fg', className)} data-testid="drop-countdown">
      <p className="text-sm font-semibold">
        <time dateTime={releaseAt}>{date}</time>
      </p>
      {left && !left.done && (
        <p className="font-display mt-2 text-3xl tabular-nums" aria-live="off">
          {left.days}d {left.hours}h {left.minutes}m
        </p>
      )}
    </div>
  );
}
