'use client';

import { useId, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { isValidEmail, WAITLIST_CONSENT_TEXT } from '@/domain/consent';
import { cn } from '@/lib/cn';

/** Drop waitlist sign-up with explicit consent; the server prevents duplicates. */
export function WaitlistForm({ slug, className }: { slug: string; className?: string }) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<{ status: 'idle' | 'submitting' | 'done' | 'error'; message?: string }>({ status: 'idle' });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidEmail(email.trim())) return setState({ status: 'error', message: 'Enter a valid email address.' });
    if (!consent) return setState({ status: 'error', message: 'Tick the box so we can email you about this drop.' });
    setState({ status: 'submitting' });
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, email: email.trim(), consent }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) return setState({ status: 'error', message: data.error ?? 'Something went wrong.' });
      setState({ status: 'done', message: data.message });
      setEmail('');
    } catch {
      setState({ status: 'error', message: 'Network error. Try again.' });
    }
  }

  if (state.status === 'done') {
    return (
      <p role="status" data-testid="waitlist-done" className={cn('text-fg text-sm font-medium', className)}>
        {state.message}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className={cn('w-full max-w-md', className)} data-testid="waitlist-form">
      <label htmlFor={id} className="sr-only">
        Email address
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id={id}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email address"
          aria-invalid={state.status === 'error'}
          className="border-field focus:border-fg text-fg placeholder:text-fg-faint h-12 flex-1 border bg-transparent px-4 text-sm outline-none"
        />
        <Button type="submit" size="md" disabled={state.status === 'submitting'}>
          {state.status === 'submitting' ? 'Joining…' : 'Notify me'}
        </Button>
      </div>
      <label className="text-fg-muted mt-3 flex cursor-pointer items-start gap-3 text-left text-xs leading-relaxed">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="accent-fg mt-0.5 h-4 w-4 shrink-0" />
        <span>{WAITLIST_CONSENT_TEXT}</span>
      </label>
      {state.status === 'error' && (
        <p role="alert" className="text-signal mt-2 text-xs">
          {state.message}
        </p>
      )}
    </form>
  );
}
