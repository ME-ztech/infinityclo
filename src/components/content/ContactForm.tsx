'use client';

/**
 * Contact form.
 *
 * Posts to `/api/contact`, which stores the message in the admin inbox (and
 * emails it when a provider is configured). The confirmation shown is the
 * server's own message, so the form never claims a delivery that did not happen.
 *
 * `website` is a honeypot: hidden from people and assistive technology, left
 * empty by them, filled in by naive bots. The server discards anything that
 * fills it.
 */
import { useId, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TOPICS = [
  { value: 'order', label: 'An order' },
  { value: 'return', label: 'A return or exchange' },
  { value: 'sizing', label: 'Sizing' },
  { value: 'wholesale', label: 'Wholesale / collaboration' },
  { value: 'other', label: 'Something else' },
] as const;

type Topic = (typeof TOPICS)[number]['value'];

interface Values {
  name: string;
  email: string;
  phone: string;
  topic: Topic;
  orderNumber: string;
  message: string;
  website: string;
}

type Errors = Partial<Record<'name' | 'email' | 'message', string>>;

const EMPTY: Values = {
  name: '',
  email: '',
  phone: '',
  topic: 'order',
  orderNumber: '',
  message: '',
  website: '',
};

const labelClass =
  'text-fg-faint mb-2 block text-[0.68rem] font-semibold tracking-[0.16em] uppercase';
const fieldClass =
  'text-fg h-12 w-full border bg-transparent px-4 text-sm transition-colors outline-none';

export function ContactForm() {
  const baseId = useId();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  function validate(): Errors {
    const next: Errors = {};
    if (!values.name.trim()) next.name = 'Enter your name.';
    if (!EMAIL_PATTERN.test(values.email.trim())) next.email = 'Enter a valid email address.';
    if (values.message.trim().length < 10) next.message = 'Message must be at least 10 characters.';
    return next;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setMessage(null);
    if (Object.keys(found).length > 0) {
      setStatus('idle');
      return;
    }

    setStatus('submitting');
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone.trim() || undefined,
          topic: values.topic,
          orderNumber: values.orderNumber.trim() || undefined,
          message: values.message.trim(),
          website: values.website,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        setStatus('error');
        setMessage(data.error ?? 'Your message could not be sent. Try again.');
        return;
      }
      setStatus('success');
      setMessage(data.message ?? 'Message received.');
      setValues(EMPTY);
    } catch {
      setStatus('error');
      setMessage('Network error. Your message was not sent — try again.');
    }
  }

  const text = (
    key: 'name' | 'email' | 'phone' | 'orderNumber',
    label: string,
    type: string,
    autoComplete: string | undefined,
    optional = false,
  ) => {
    const error = key === 'name' || key === 'email' ? errors[key] : undefined;
    return (
      <div>
        <label htmlFor={`${baseId}-${key}`} className={labelClass}>
          {label}
          {optional && <span className="text-fg-faint ml-1.5 normal-case">(optional)</span>}
        </label>
        <input
          id={`${baseId}-${key}`}
          type={type}
          autoComplete={autoComplete}
          value={values[key]}
          onChange={(event) => set(key, event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${baseId}-${key}-error` : undefined}
          className={cn(fieldClass, error ? 'border-signal' : 'border-field focus:border-fg')}
        />
        {error && (
          <p id={`${baseId}-${key}-error`} role="alert" className="text-signal mt-2 text-xs">
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate data-testid="contact-form" className="flex flex-col gap-5">
      {text('name', 'Name', 'text', 'name')}
      {text('email', 'Email', 'email', 'email')}
      {text('phone', 'Phone number', 'tel', 'tel', true)}

      <div>
        <label htmlFor={`${baseId}-topic`} className={labelClass}>
          What is it about?
        </label>
        <select
          id={`${baseId}-topic`}
          value={values.topic}
          onChange={(event) => set('topic', event.target.value as Topic)}
          className={cn(fieldClass, 'border-field focus:border-fg')}
        >
          {TOPICS.map((topic) => (
            <option key={topic.value} value={topic.value}>
              {topic.label}
            </option>
          ))}
        </select>
      </div>

      {(values.topic === 'order' || values.topic === 'return') &&
        text('orderNumber', 'Order number', 'text', undefined, true)}

      <div>
        <label htmlFor={`${baseId}-message`} className={labelClass}>
          Message
        </label>
        <textarea
          id={`${baseId}-message`}
          rows={6}
          maxLength={4000}
          value={values.message}
          onChange={(event) => set('message', event.target.value)}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? `${baseId}-message-error` : undefined}
          className={cn(
            'text-fg w-full resize-y border bg-transparent p-4 text-sm transition-colors outline-none',
            errors.message ? 'border-signal' : 'border-field focus:border-fg',
          )}
        />
        {errors.message && (
          <p id={`${baseId}-message-error`} role="alert" className="text-signal mt-2 text-xs">
            {errors.message}
          </p>
        )}
      </div>

      {/* Honeypot. Off-screen, unfocusable and hidden from assistive tech. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={(event) => set('website', event.target.value)}
          />
        </label>
      </div>

      <Button type="submit" variant="primary" size="lg" fullWidth disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Sending…' : 'Send message'}
      </Button>

      {message && (
        <p
          role={status === 'error' ? 'alert' : 'status'}
          data-testid="contact-result"
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
