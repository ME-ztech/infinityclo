import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NewsletterForm } from './NewsletterForm';

function emailField(): HTMLInputElement {
  return screen.getByTestId('newsletter-email') as HTMLInputElement;
}

describe('NewsletterForm', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'Received.' }), { status: 200 })),
    );
  });

  it('rejects an invalid address without calling the API', async () => {
    const user = userEvent.setup();
    render(<NewsletterForm />);

    await user.type(emailField(), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /join/i }));

    const message = await screen.findByTestId('newsletter-message');
    expect(message.textContent).toMatch(/valid email/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('marks the field invalid for assistive technology', async () => {
    const user = userEvent.setup();
    render(<NewsletterForm />);

    await user.type(emailField(), 'bad');
    await user.click(screen.getByRole('button', { name: /join/i }));

    await screen.findByTestId('newsletter-message');
    expect(emailField().getAttribute('aria-invalid')).toBe('true');
  });

  it('submits a valid address and confirms', async () => {
    const user = userEvent.setup();
    render(<NewsletterForm source="footer" />);

    await user.type(emailField(), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: /join/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const message = await screen.findByTestId('newsletter-message');
    expect(message.textContent).toBe('Received.');
  });

  it('clears the error once the customer starts correcting it', async () => {
    const user = userEvent.setup();
    render(<NewsletterForm />);

    await user.type(emailField(), 'bad');
    await user.click(screen.getByRole('button', { name: /join/i }));
    await screen.findByTestId('newsletter-message');

    await user.type(emailField(), 'x');
    await waitFor(() => expect(screen.queryByTestId('newsletter-message')).toBeNull());
  });

  it('surfaces a server-side rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Rejected.' }), { status: 400 })),
    );

    const user = userEvent.setup();
    render(<NewsletterForm />);

    await user.type(emailField(), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: /join/i }));

    const message = await screen.findByTestId('newsletter-message');
    expect(message.textContent).toBe('Rejected.');
  });

  it('reports a network failure instead of silently doing nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    const user = userEvent.setup();
    render(<NewsletterForm />);

    await user.type(emailField(), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: /join/i }));

    const message = await screen.findByTestId('newsletter-message');
    expect(message.textContent).toMatch(/network error/i);
  });
});
