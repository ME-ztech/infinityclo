import { cn } from '@/lib/cn';
import { BRAND } from '@/lib/site';

/**
 * The INFNITY wordmark, set in type rather than shipped as an image.
 *
 * The legacy logo files could not be retrieved from the blocked source, so this
 * is a typographic stand-in built from the brand's own name and letterspacing
 * rather than an invented mark. Swapping in the official artwork means changing
 * this one component. Tracked in docs/ASSET_PROVENANCE.md.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'font-display text-paper leading-none tracking-[0.22em] uppercase select-none',
        className,
      )}
    >
      {BRAND.name}
    </span>
  );
}
