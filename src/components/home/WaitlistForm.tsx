'use client';

/**
 * Drop waitlist signup. One entry per address per drop; the consent checkbox
 * starts unticked and the server records the exact wording shown here.
 */
import { useId, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function WaitlistForm({
  dropId,
  consentText,
  className,
}: {
  dropId: string;
  consentText: string;
  className?: string;
}) {
  const inputId = useId();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);

  function fail(text: string) {
    setStatus('error');
    setMessage(text);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) return fail('Enter a valid email address.');
    if (!consent) return fail('Tick the box so we know you want this email.');

    setStatus('submitting');
    setMessage(null);
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: trimmed, dropId, consent: true }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) return fail(data.error ?? 'Something went wrong. Try again.');
      setStatus('success');
      setMessage(data.message ?? 'You are on the waitlist.');
      setEmail('');
      setConsent(false);
    } catch {
      fail('Network error. Try again.');
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      data-testid="waitlist-form"
      className={cn('w-full', className)}
    >
      <label htmlFor={inputId} className="sr-only">
        Email address
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id={inputId}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email address"
          autoComplete="email"
          aria-invalid={status === 'error'}
          aria-describedby={message ? `${inputId}-message` : undefined}
          className={cn(
            'text-fg placeholder:text-fg-faint h-12 min-w-0 flex-1 border bg-transparent px-4 text-sm outline-none',
            status === 'error' ? 'border-signal' : 'border-field focus:border-fg',
          )}
        />
        <Button type="submit" disabled={status === 'submitting'} size="md">
          {status === 'submitting' ? 'Joining…' : 'Join the waitlist'}
        </Button>
      </div>

      <label className="text-fg-muted mt-4 flex min-h-11 cursor-pointer items-start gap-3 text-left text-xs leading-relaxed">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="accent-ink mt-0.5 h-5 w-5 shrink-0"
        />
        <span>{consentText}</span>
      </label>

      {message && (
        <p
          id={`${inputId}-message`}
          role={status === 'error' ? 'alert' : 'status'}
          className={cn('mt-3 text-xs', status === 'error' ? 'text-signal' : 'text-fg font-semibold')}
        >
          {message}
        </p>
      )}
    </form>
  );
}
