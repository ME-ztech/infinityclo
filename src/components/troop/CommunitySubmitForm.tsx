'use client';

/**
 * Community photo submission.
 *
 * Posts multipart form data to `/api/community/submit`. Nothing is published by
 * submitting: every photo goes to moderation first, and it only appears once
 * staff approve it.
 *
 * Permission is explicit. The consent checkbox starts unticked and carries the
 * exact wording the server stores with the submission; public credit is a
 * separate, optional choice.
 */
import { useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

const labelClass =
  'text-fg-faint mb-2 block text-[0.68rem] font-semibold tracking-[0.16em] uppercase';
const fieldClass =
  'text-fg border-field focus:border-fg h-12 w-full border bg-transparent px-4 text-sm outline-none';

export function CommunitySubmitForm({ consentText }: { consentText: string }) {
  const baseId = useId();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [handle, setHandle] = useState('');
  const [creditPublicly, setCreditPublicly] = useState(false);
  const [caption, setCaption] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  function fail(text: string) {
    setStatus('error');
    setMessage(text);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return fail('Choose a photo to send.');
    if (!ACCEPTED.includes(file.type)) return fail('Photos must be JPG, PNG or WebP.');
    if (file.size > MAX_BYTES) return fail('Photos must be 8 MB or smaller.');
    if (!EMAIL_PATTERN.test(email.trim())) return fail('Enter a valid email address.');
    if (!consent) return fail('Tick the permission box so we are allowed to show your photo.');

    setStatus('submitting');
    setMessage(null);

    const body = new FormData();
    body.set('image', file);
    body.set('handle', handle.trim());
    body.set('creditPublicly', creditPublicly ? 'yes' : 'no');
    body.set('caption', caption.trim());
    body.set('email', email.trim());
    body.set('consent', 'yes');
    body.set('website', website);

    try {
      const response = await fetch('/api/community/submit', { method: 'POST', body });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) return fail(data.error ?? 'Your photo could not be sent. Try again.');

      setStatus('success');
      setMessage(data.message ?? 'Thanks — your photo is in the review queue.');
      setFile(null);
      setHandle('');
      setCreditPublicly(false);
      setCaption('');
      setEmail('');
      setConsent(false);
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      fail('Network error. Your photo was not sent — try again.');
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      data-testid="community-form"
      className="flex flex-col gap-5 text-left"
    >
      <div>
        <label htmlFor={`${baseId}-image`} className={labelClass}>
          Your photo
        </label>
        <input
          ref={fileRef}
          id={`${baseId}-image`}
          type="file"
          accept={ACCEPTED.join(',')}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          aria-describedby={`${baseId}-image-hint`}
          className="text-fg file:bg-inverse-surface file:text-inverse-fg border-field block w-full border text-sm file:mr-4 file:h-12 file:cursor-pointer file:border-0 file:px-5 file:text-[0.7rem] file:font-semibold file:tracking-[0.16em] file:uppercase"
        />
        <p id={`${baseId}-image-hint`} className="text-fg-faint mt-2 text-xs">
          JPG, PNG or WebP, up to 8 MB.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${baseId}-handle`} className={labelClass}>
            Instagram handle <span className="normal-case">(optional)</span>
          </label>
          <input
            id={`${baseId}-handle`}
            type="text"
            value={handle}
            onChange={(event) => setHandle(event.target.value.slice(0, 40))}
            placeholder="@yourhandle"
            autoComplete="off"
            className={cn(fieldClass, 'placeholder:text-fg-faint')}
          />
        </div>
        <div>
          <label htmlFor={`${baseId}-email`} className={labelClass}>
            Email
          </label>
          <input
            id={`${baseId}-email`}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            aria-describedby={`${baseId}-email-hint`}
            className={fieldClass}
          />
          <p id={`${baseId}-email-hint`} className="text-fg-faint mt-2 text-xs">
            Only used to reach you about this photo. Never shown.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor={`${baseId}-caption`} className={labelClass}>
          Caption <span className="normal-case">(optional)</span>
        </label>
        <input
          id={`${baseId}-caption`}
          type="text"
          value={caption}
          onChange={(event) => setCaption(event.target.value.slice(0, 200))}
          className={fieldClass}
        />
      </div>

      <label className="text-fg-muted flex min-h-11 cursor-pointer items-start gap-3 text-xs leading-relaxed">
        <input
          type="checkbox"
          checked={creditPublicly}
          onChange={(event) => setCreditPublicly(event.target.checked)}
          className="accent-ink mt-0.5 h-5 w-5 shrink-0"
        />
        <span>Show my Instagram handle with the photo.</span>
      </label>

      <label className="text-fg-muted flex min-h-11 cursor-pointer items-start gap-3 text-xs leading-relaxed">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          data-testid="community-consent"
          className="accent-ink mt-0.5 h-5 w-5 shrink-0"
        />
        <span>{consentText}</span>
      </label>

      {/* Honeypot. Off-screen, unfocusable and hidden from assistive tech. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </label>
      </div>

      <Button type="submit" size="lg" fullWidth disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Sending…' : 'Send for review'}
      </Button>

      {message && (
        <p
          role={status === 'error' ? 'alert' : 'status'}
          data-testid="community-result"
          className={cn(
            'border-l-2 py-1 pl-4 text-sm leading-relaxed',
            status === 'error' ? 'border-signal text-signal' : 'border-fg text-fg',
          )}
        >
          {message}
        </p>
      )}
    </form>
  );
}
