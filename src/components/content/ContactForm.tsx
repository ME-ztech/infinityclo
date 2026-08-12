'use client';

/**
 * Contact form.
 *
 * The form and its validation are real so the surface can be reviewed and so
 * Phase 2 only has to add a transport. What it deliberately does not do is
 * claim delivery: with no mail provider connected, submitting reports plainly
 * that the message was not sent. A "thanks, we'll be in touch" confirmation
 * here would be a straightforward lie to a customer waiting on a reply.
 */
import { useId, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Errors {
  name?: string;
  email?: string;
  message?: string;
}

export function ContactForm() {
  const baseId = useId();
  const [values, setValues] = useState({ name: '', email: '', message: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [isBlocked, setIsBlocked] = useState(false);

  function validate(): Errors {
    const next: Errors = {};
    if (!values.name.trim()) next.name = 'Enter your name.';
    if (!EMAIL_PATTERN.test(values.email.trim())) next.email = 'Enter a valid email address.';
    if (values.message.trim().length < 10) next.message = 'Message must be at least 10 characters.';
    return next;
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setIsBlocked(Object.keys(found).length === 0);
  }

  const fields = [
    { key: 'name' as const, label: 'Name', type: 'text', autoComplete: 'name' },
    { key: 'email' as const, label: 'Email', type: 'email', autoComplete: 'email' },
  ];

  return (
    <form onSubmit={onSubmit} noValidate data-testid="contact-form" className="flex flex-col gap-6">
      {fields.map((field) => (
        <div key={field.key}>
          <label
            htmlFor={`${baseId}-${field.key}`}
            className="text-dim mb-2 block text-[0.68rem] font-semibold tracking-[0.16em] uppercase"
          >
            {field.label}
          </label>
          <input
            id={`${baseId}-${field.key}`}
            type={field.type}
            autoComplete={field.autoComplete}
            value={values[field.key]}
            onChange={(event) => {
              setValues((current) => ({ ...current, [field.key]: event.target.value }));
              setIsBlocked(false);
            }}
            aria-invalid={Boolean(errors[field.key])}
            aria-describedby={errors[field.key] ? `${baseId}-${field.key}-error` : undefined}
            className={cn(
              'text-bone h-12 w-full border bg-transparent px-4 text-sm transition-colors outline-none',
              errors[field.key] ? 'border-signal' : 'border-field focus:border-bone',
            )}
          />
          {errors[field.key] && (
            <p
              id={`${baseId}-${field.key}-error`}
              role="alert"
              className="text-signal mt-2 text-xs"
            >
              {errors[field.key]}
            </p>
          )}
        </div>
      ))}

      <div>
        <label
          htmlFor={`${baseId}-message`}
          className="text-dim mb-2 block text-[0.68rem] font-semibold tracking-[0.16em] uppercase"
        >
          Message
        </label>
        <textarea
          id={`${baseId}-message`}
          rows={6}
          value={values.message}
          onChange={(event) => {
            setValues((current) => ({ ...current, message: event.target.value }));
            setIsBlocked(false);
          }}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? `${baseId}-message-error` : undefined}
          className={cn(
            'text-bone w-full resize-y border bg-transparent p-4 text-sm transition-colors outline-none',
            errors.message ? 'border-signal' : 'border-field focus:border-bone',
          )}
        />
        {errors.message && (
          <p id={`${baseId}-message-error`} role="alert" className="text-signal mt-2 text-xs">
            {errors.message}
          </p>
        )}
      </div>

      <Button type="submit" variant="primary" size="lg" fullWidth>
        Send
      </Button>

      {isBlocked && (
        <p
          role="status"
          data-testid="contact-blocked"
          className="border-ash text-bone border-l-2 py-1 pl-4 text-sm leading-relaxed"
        >
          Your message was not sent. Messaging is not connected in this preview build, so there is
          nowhere for it to go yet — nothing has been stored.
        </p>
      )}
    </form>
  );
}
