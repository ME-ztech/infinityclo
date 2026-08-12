import { cn } from '@/lib/cn';
import { BRAND } from '@/lib/site';

/**
 * The INFNITY wordmark, set in type rather than shipped as an image.
 *
 * The official logo files could not be retrieved — the source host is blocked in
 * this environment — so this is a typographic mark built from the brand's own
 * name, oblique and letterspaced the way the storefront sets INFNITY.CLO, rather
 * than an invented logo. Swapping in the real artwork means changing this one
 * component. Tracked in docs/ASSET_PROVENANCE.md.
 *
 * `text-fg` rather than a fixed colour: the mark appears on bone in the header
 * and on void in the footer and the mobile menu, and it must read on all three.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'font-display oblique text-fg leading-none tracking-[0.12em] uppercase select-none',
        className,
      )}
    >
      {BRAND.name}
      <span className="text-signal">.</span>
      <span className="tracking-[0.08em]">clo</span>
    </span>
  );
}
