'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';

import { cn } from '@/lib/cn';

export interface ActionResult {
  readonly ok?: boolean;
  readonly message?: string;
  readonly error?: string;
  readonly redirectTo?: string;
}

type Action = (state: ActionResult | null, form: FormData) => Promise<ActionResult>;

/**
 * Form bound to a server action with an honest result line. `confirm` asks
 * before destructive or outward-facing changes; the server re-checks
 * permissions regardless of what the browser does.
 */
export function ActionForm({
  action,
  children,
  submitLabel = 'Save',
  confirm,
  className,
  variant = 'primary',
  hideSubmit = false,
  inline = false,
  testId,
}: {
  action: Action;
  children?: React.ReactNode;
  submitLabel?: string;
  confirm?: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  hideSubmit?: boolean;
  /** Lay fields and the button out in one row (for table cells). */
  inline?: boolean;
  testId?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.redirectTo) router.push(state.redirectTo);
  }, [state, router]);
  return (
    <form
      action={formAction}
      data-testid={testId}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className={cn(inline ? 'flex flex-row flex-wrap items-center gap-2' : 'flex flex-col gap-4', className)}
    >
      {children}
      {!hideSubmit && !inline && (
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton label={submitLabel} variant={variant} />
          <Result state={state} />
        </div>
      )}
      {!hideSubmit && inline && (
        <>
          <SubmitButton label={submitLabel} variant={variant} />
          <Result state={state} />
        </>
      )}
      {hideSubmit && <Result state={state} />}
    </form>
  );
}

export function SubmitButton({ label, variant = 'primary', name, value }: { label: string; variant?: 'primary' | 'secondary' | 'danger'; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={cn(
        'inline-flex h-10 items-center justify-center px-4 text-xs font-semibold tracking-[0.12em] uppercase transition-colors disabled:opacity-50',
        variant === 'primary' && 'bg-ink text-paper hover:bg-signal',
        variant === 'secondary' && 'border-ink text-ink hover:bg-ink hover:text-paper border',
        variant === 'danger' && 'border-signal text-signal hover:bg-signal hover:text-paper border',
      )}
    >
      {pending ? 'Working…' : label}
    </button>
  );
}

function Result({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (state.error) {
    return (
      <p role="alert" className="text-signal text-sm" data-testid="action-error">
        {state.error}
      </p>
    );
  }
  return (
    <p role="status" className="text-sm text-green-700" data-testid="action-ok">
      {state.message ?? 'Saved.'}
    </p>
  );
}
