import { ButtonLink } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="edge flex min-h-[70svh] flex-col items-center justify-center pt-28 pb-[--spacing-section] text-center">
      <p className="font-display text-statement text-paper leading-none">404</p>
      <p className="text-smoke mt-6 max-w-sm text-sm leading-relaxed">
        That page doesn&apos;t exist. It may have moved, or the piece may have sold through into the
        Vault.
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/shop" variant="primary" size="lg">
          Shop all
        </ButtonLink>
        <ButtonLink href="/vault" variant="secondary" size="lg">
          The Vault
        </ButtonLink>
      </div>
    </div>
  );
}
