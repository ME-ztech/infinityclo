'use client';

import { useId, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { isValidEmail } from '@/domain/consent';
import { cn } from '@/lib/cn';

const KINDS = [
  { value: 'contact', label: 'General question' },
  { value: 'order_help', label: 'Help with an order' },
  { value: 'return', label: 'Start a return' },
  { value: 'exchange', label: 'Exchange a size' },
] as const;

/**
 * Contact form → staff inbox (Admin → Inbox). Return and exchange requests are
 * reviewed by a person against the published refund policy; nothing is
 * refunded automatically.
 */
export function ContactForm({ defaultKind = 'contact', defaultOrder = '' }: { defaultKind?: string; defaultOrder?: string }) {
  const id = useId();
  const [values, setValues] = useState({ kind: defaultKind, name: '', email: '', orderNumber: defaultOrder, message: '', website: '' });
  const [state, setState] = useState<{ status: 'idle' | 'sending' | 'sent' | 'error'; message?: string }>({ status: 'idle' });
  const needsOrder = values.kind !== 'contact';

  function set<K extends keyof typeof values>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    if (state.status === 'error') setState({ status: 'idle' });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values.name.trim()) return setState({ status: 'error', message: 'Add your name.' });
    if (!isValidEmail(values.email.trim())) return setState({ status: 'error', message: 'Enter a valid email address.' });
    if (needsOrder && !values.orderNumber.trim()) return setState({ status: 'error', message: 'Add your order number (e.g. #1042).' });
    if (values.message.trim().length < 10) return setState({ status: 'error', message: 'Tell us a little more (10 characters or more).' });
    setState({ status: 'sending' });
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) return setState({ status: 'error', message: data.error ?? 'Your message could not be sent.' });
      setState({ status: 'sent', message: data.message });
    } catch {
      setState({ status: 'error', message: 'Network error. Try again.' });
    }
  }

  if (state.status === 'sent') {
    return (
      <div role="status" data-testid="contact-sent" className="border-line border p-8 text-center">
        <p className="font-display text-2xl">Message received</p>
        <p className="text-fg-muted mt-3 text-sm">{state.message}</p>
      </div>
    );
  }

  const field = 'border-field focus:border-fg text-fg h-12 w-full border bg-transparent px-4 text-sm outline-none';
  return (
    <form onSubmit={onSubmit} noValidate data-testid="contact-form" className="flex flex-col gap-5">
      <div>
        <label htmlFor={`${id}-kind`} className="text-fg-faint mb-2 block text-[0.66rem] font-semibold tracking-[0.2em] uppercase">
          What do you need?
        </label>
        <select id={`${id}-kind`} value={values.kind} onChange={(event) => set('kind', event.target.value)} className={field}>
          {KINDS.map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label}
            </option>
          ))}
        </select>
      </div>
      {(
        [
          ['name', 'Name', 'text', 'name'],
          ['email', 'Email', 'email', 'email'],
        ] as const
      ).map(([key, label, type, autoComplete]) => (
        <div key={key}>
          <label htmlFor={`${id}-${key}`} className="text-fg-faint mb-2 block text-[0.66rem] font-semibold tracking-[0.2em] uppercase">
            {label}
          </label>
          <input id={`${id}-${key}`} type={type} autoComplete={autoComplete} value={values[key]} onChange={(event) => set(key, event.target.value)} className={field} />
        </div>
      ))}
      {needsOrder && (
        <div>
          <label htmlFor={`${id}-order`} className="text-fg-faint mb-2 block text-[0.66rem] font-semibold tracking-[0.2em] uppercase">
            Order number
          </label>
          <input id={`${id}-order`} value={values.orderNumber} onChange={(event) => set('orderNumber', event.target.value)} placeholder="#1042" className={field} />
          {(values.kind === 'return' || values.kind === 'exchange') && (
            <p className="text-fg-faint mt-2 text-xs leading-relaxed">
              Returns are accepted within 10 days of delivery for unworn items with tags, in original packaging; sale items are final. We’ll reply
              with next steps — please don’t send anything back before we do.
            </p>
          )}
        </div>
      )}
      <div>
        <label htmlFor={`${id}-message`} className="text-fg-faint mb-2 block text-[0.66rem] font-semibold tracking-[0.2em] uppercase">
          Message
        </label>
        <textarea id={`${id}-message`} rows={5} value={values.message} onChange={(event) => set('message', event.target.value)} className={cn(field, 'h-auto py-3')} />
      </div>
      {/* Honeypot for bots; hidden from people and assistive technology. */}
      <div aria-hidden className="absolute -left-[9999px]">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={values.website} onChange={(event) => set('website', event.target.value)} />
        </label>
      </div>
      {state.status === 'error' && (
        <p role="alert" className="text-signal text-sm">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={state.status === 'sending'}>
        {state.status === 'sending' ? 'Sending…' : 'Send message'}
      </Button>
    </form>
  );
}
