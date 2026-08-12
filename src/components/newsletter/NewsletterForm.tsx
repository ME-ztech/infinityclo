'use client';

/**
 * Newsletter capture — "Join The Troop".
 *
 * Validation and the full interaction are real. The submission goes to
 * `/api/newsletter`, which in Phase 1 validates and returns success **without
 * storing anything**, because no email provider is connected. The success copy
 * is written to avoid promising delivery of something we cannot yet send; the
 * route's own documentation records the seam where a provider drops in.
 */
import { useId, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/cn';

// Deliberately permissive: the server and the provider are the real authority
// on deliverability, and over-strict client regexes reject valid addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function NewsletterForm({
  source = 'footer',
  className,
}: {
  source?: string;
  className?: string;
}) {
  const inputId = useId();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();

    if (!EMAIL_PATTERN.test(trimmed)) {
      setStatus('error');
      setMessage('Enter a valid email address.');
      return;
    }

    setStatus('submitting');
    setMessage(null);

    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source }),
      });
      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        setStatus('error');
        setMessage(data.error ?? 'Something went wrong. Try again.');
        return;
      }

      setStatus('success');
      setMessage(data.message ?? 'You are on the list.');
      setEmail('');
      track({ name: 'newsletter_signup', source });
    } catch {
      setStatus('error');
      setMessage('Network error. Try again.');
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={cn('w-full', className)}
      data-testid="newsletter-form"
    >
      <label htmlFor={inputId} className="sr-only">
        Email address
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id={inputId}
          type="email"
          name="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (status === 'error') {
              setStatus('idle');
              setMessage(null);
            }
          }}
          placeholder="Email address"
          autoComplete="email"
          aria-invalid={status === 'error'}
          aria-describedby={message ? `${inputId}-message` : undefined}
          data-testid="newsletter-email"
          className={cn(
            'text-bone placeholder:text-dim h-12 flex-1 border bg-transparent px-4 text-sm transition-colors outline-none',
            status === 'error' ? 'border-signal' : 'border-ash focus:border-bone',
          )}
        />
        <Button type="submit" disabled={status === 'submitting'} size="md">
          {status === 'submitting' ? 'Joining…' : 'Join'}
        </Button>
      </div>

      {message && (
        <p
          id={`${inputId}-message`}
          role={status === 'error' ? 'alert' : 'status'}
          data-testid="newsletter-message"
          className={cn('mt-3 text-xs', status === 'error' ? 'text-signal' : 'text-smoke')}
        >
          {message}
        </p>
      )}
    </form>
  );
}
