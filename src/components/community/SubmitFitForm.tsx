'use client';

import { useId, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { COMMUNITY_CONSENT_TEXT, isValidEmail } from '@/domain/consent';

/** Fit submission: photo upload or Instagram link, explicit consent, moderated before anything is public. */
export function SubmitFitForm() {
  const id = useId();
  const [state, setState] = useState<{
    status: 'idle' | 'sending' | 'sent' | 'error';
    message?: string;
  }>({ status: 'idle' });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const handle = String(form.get('handle') ?? '').trim();
    const photo = form.get('photo');
    const link = String(form.get('instagramUrl') ?? '').trim();
    if (!handle) return setState({ status: 'error', message: 'Add your Instagram handle.' });
    if (!isValidEmail(email))
      return setState({ status: 'error', message: 'Enter a valid email address.' });
    if (!(photo instanceof File && photo.size > 0) && !link)
      return setState({ status: 'error', message: 'Add a photo or a link to your post.' });
    if (photo instanceof File && photo.size > 6 * 1024 * 1024)
      return setState({ status: 'error', message: 'Photos must be 6 MB or smaller.' });
    if (form.get('consent') !== 'on')
      return setState({ status: 'error', message: 'Tick the permission box to submit.' });
    setState({ status: 'sending' });
    try {
      const response = await fetch('/api/community/submit', { method: 'POST', body: form });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok)
        return setState({ status: 'error', message: data.error ?? 'Submission failed.' });
      setState({ status: 'sent', message: data.message });
    } catch {
      setState({ status: 'error', message: 'Network error. Try again.' });
    }
  }

  if (state.status === 'sent') {
    return (
      <p
        role="status"
        data-testid="fit-submitted"
        className="border-line border p-6 text-center text-sm"
      >
        {state.message}
      </p>
    );
  }

  const field =
    'border-field focus:border-fg h-12 w-full border bg-transparent px-4 text-sm outline-none';
  const label = 'text-fg-faint mb-2 block text-[0.66rem] font-semibold tracking-[0.2em] uppercase';
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      encType="multipart/form-data"
      className="flex flex-col gap-5 text-left"
      data-testid="submit-fit-form"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-handle`} className={label}>
            Instagram handle
          </label>
          <input
            id={`${id}-handle`}
            name="handle"
            placeholder="@yourhandle"
            autoComplete="off"
            className={field}
          />
        </div>
        <div>
          <label htmlFor={`${id}-email`} className={label}>
            Email (private)
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            className={field}
          />
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-photo`} className={label}>
          Photo (JPEG, PNG or WebP, up to 6 MB)
        </label>
        <input
          id={`${id}-photo`}
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="text-fg-muted text-sm file:mr-4 file:border file:border-current file:bg-transparent file:px-4 file:py-2"
        />
      </div>
      <div>
        <label htmlFor={`${id}-link`} className={label}>
          …or link to your post
        </label>
        <input
          id={`${id}-link`}
          name="instagramUrl"
          type="url"
          placeholder="https://www.instagram.com/p/…"
          className={field}
        />
      </div>
      <div>
        <label htmlFor={`${id}-caption`} className={label}>
          What are you wearing? (optional)
        </label>
        <input id={`${id}-caption`} name="caption" maxLength={140} className={field} />
      </div>
      <label className="text-fg-muted flex cursor-pointer items-start gap-3 text-xs leading-relaxed">
        <input type="checkbox" name="consent" className="accent-fg mt-0.5 h-4 w-4 shrink-0" />
        <span>{COMMUNITY_CONSENT_TEXT}</span>
      </label>
      {state.status === 'error' && (
        <p role="alert" className="text-signal text-sm">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={state.status === 'sending'}>
        {state.status === 'sending' ? 'Sending…' : 'Submit your fit'}
      </Button>
      <p className="text-fg-faint text-xs">
        Every submission is reviewed before it appears. Photos are re-processed to remove location
        data.
      </p>
    </form>
  );
}
