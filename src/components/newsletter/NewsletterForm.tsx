'use client';

/**
 * Newsletter signup.
 *
 * Consent is explicit: the checkbox starts unticked, carries the exact wording
 * the server records, and the form will not submit without it. An email address
 * alone is never treated as permission to market (CASL).
 */
import { useId, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/cn';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function NewsletterForm({
  source = 'footer',
  consentText,
  className,
  align = 'left',
}: {
  source?: string;
  /** The wording the visitor agrees to. Supplied by the server so both match. */
  consentText: string;
  className?: string;
  align?: 'left' | 'center';
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
    if (!consent) return fail('Tick the box to confirm you want to receive emails.');

    setStatus('submitting');
    setMessage(null);

    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: trimmed, consent: true, source }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) return fail(data.error ?? 'Something went wrong. Try again.');

      setStatus('success');
      setMessage(data.message ?? 'You are on the list.');
      setEmail('');
      setConsent(false);
      track({ name: 'newsletter_signup', source });
    } catch {
      fail('Network error. Try again.');
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
            'text-fg placeholder:text-fg-faint h-12 min-w-0 flex-1 border bg-transparent px-4 text-sm transition-colors outline-none',
            status === 'error' ? 'border-signal' : 'border-field focus:border-fg',
          )}
        />
        <Button type="submit" disabled={status === 'submitting'} size="md">
          {status === 'submitting' ? 'Joining…' : 'Sign up'}
        </Button>
      </div>

      <label
        className={cn(
          'text-fg-muted mt-4 flex min-h-11 cursor-pointer items-start gap-3 text-left text-xs leading-relaxed',
          align === 'center' && 'mx-auto max-w-md',
        )}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => {
            setConsent(event.target.checked);
            if (status === 'error') {
              setStatus('idle');
              setMessage(null);
            }
          }}
          data-testid="newsletter-consent"
          className="accent-ink mt-0.5 h-5 w-5 shrink-0"
        />
        <span>{consentText}</span>
      </label>

      {message && (
        <p
          id={`${inputId}-message`}
          role={status === 'error' ? 'alert' : 'status'}
          data-testid="newsletter-message"
          className={cn(
            'mt-3 text-xs',
            status === 'error' ? 'text-signal' : 'text-fg font-semibold',
            align === 'center' && 'text-center',
          )}
        >
          {message}
        </p>
      )}
    </form>
  );
}
