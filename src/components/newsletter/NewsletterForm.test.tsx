import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NewsletterForm } from './NewsletterForm';

const CONSENT = 'I agree to receive marketing emails from INFNITY.';

function emailField(): HTMLInputElement {
  return screen.getByTestId('newsletter-email') as HTMLInputElement;
}

const consentBox = () => screen.getByTestId('newsletter-consent') as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /sign up/i });

function renderForm(source?: string) {
  return render(<NewsletterForm consentText={CONSENT} source={source} />);
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
    renderForm();

    await user.type(emailField(), 'not-an-email');
    await user.click(submit());

    const message = await screen.findByTestId('newsletter-message');
    expect(message.textContent).toMatch(/valid email/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('marks the field invalid for assistive technology', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(emailField(), 'bad');
    await user.click(submit());

    await screen.findByTestId('newsletter-message');
    expect(emailField().getAttribute('aria-invalid')).toBe('true');
  });

  it('starts with consent unticked and shows the exact wording', () => {
    renderForm();
    expect(consentBox().checked).toBe(false);
    expect(screen.getByText(CONSENT)).toBeTruthy();
  });

  it('refuses to submit without consent', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(emailField(), 'someone@example.com');
    await user.click(submit());

    const message = await screen.findByTestId('newsletter-message');
    expect(message.textContent).toMatch(/tick the box/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('submits a consented address with the consent flag and confirms', async () => {
    const user = userEvent.setup();
    renderForm('footer');

    await user.type(emailField(), 'someone@example.com');
    await user.click(consentBox());
    await user.click(submit());

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'someone@example.com',
      consent: true,
      source: 'footer',
    });
    const message = await screen.findByTestId('newsletter-message');
    expect(message.textContent).toBe('Received.');
    // Consent is per submission: it resets rather than staying ticked.
    expect(consentBox().checked).toBe(false);
  });

  it('clears the error once the customer starts correcting it', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(emailField(), 'bad');
    await user.click(submit());
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
    renderForm();

    await user.type(emailField(), 'someone@example.com');
    await user.click(consentBox());
    await user.click(submit());

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
    renderForm();

    await user.type(emailField(), 'someone@example.com');
    await user.click(consentBox());
    await user.click(submit());

    const message = await screen.findByTestId('newsletter-message');
    expect(message.textContent).toMatch(/network error/i);
  });
});
