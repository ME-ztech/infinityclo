import { cn } from '@/lib/cn';
import { BRAND } from '@/lib/site';

/**
 * The INFNITY wordmark, set in the display face the way the live store sets
 * "INFNITY.CLO" — bold, oblique, uppercase. The swoosh mark beside it is the
 * owner's own artwork from infinityclo.ca (see BrandLogo); no logo is invented.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-display leading-none tracking-[0.04em] uppercase select-none', className)}>
      {BRAND.name}
      <span className="text-signal">.</span>
      <span className="tracking-[0.02em] lowercase">clo</span>
    </span>
  );
}

export function BrandMark({ className, label }: { className?: string; label?: string }) {
  return <span className={cn('brand-mark', className)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

/** Mark + wordmark lockup used in the header and footer; scales with the viewport. */
export function BrandLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 md:gap-2.5', className)}>
      <BrandMark className={compact ? 'h-6' : 'h-6 md:h-8'} />
      <Wordmark className={compact ? 'text-base' : 'text-base md:text-xl'} />
    </span>
  );
}
