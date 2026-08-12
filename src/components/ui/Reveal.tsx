'use client';

/**
 * Scroll reveal.
 *
 * Luxury motion is controlled: content rises 20px and fades, once, and never
 * again. There is no parallax, no rotation, and nothing that keeps moving while
 * the customer is trying to read it.
 *
 * Three properties make this safe to use liberally:
 *
 * - It animates `opacity` and `transform` only, so it stays on the compositor
 *   and holds 60fps on a phone.
 * - Each element is unobserved the moment it reveals, so a catalogue of forty
 *   products is not paying for forty live observers while scrolling.
 * - If IntersectionObserver is unavailable, or the customer prefers reduced
 *   motion, the content is simply *there*. The animation is an enhancement over
 *   a fully rendered page, never the mechanism that makes it visible — which is
 *   also why the `[data-reveal]` override in globals.css forces visibility.
 */
import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface RevealProps {
  children: ReactNode;
  /** Stagger within a group, in milliseconds. Kept short — this is punctuation. */
  delay?: number;
  as?: ElementType;
  className?: string;
}

export function Reveal({ children, delay = 0, as: Tag = 'div', className }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // No observer available: reveal on the next frame rather than leaving the
    // content at opacity 0 forever. Reduced motion needs no branch here — the
    // `[data-reveal]` override in globals.css forces visibility, which is more
    // reliable than a media query read that cannot react to a mid-session change.
    if (typeof IntersectionObserver === 'undefined') {
      const frame = requestAnimationFrame(() => setIsRevealed(true));
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsRevealed(true);
            observer.disconnect();
          }
        }
      },
      // A negative bottom margin means the reveal fires slightly *before* the
      // element reaches the fold, so it is settled by the time it is read
      // rather than animating under the customer's eye.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      data-reveal=""
      style={{ transitionDelay: isRevealed && delay ? `${delay}ms` : undefined }}
      className={cn(
        // No `will-change`: opacity and transform are composited anyway, and
        // leaving the hint on after a one-shot reveal pins a GPU layer for the
        // life of the page — on a long catalogue that is dozens of layers doing
        // nothing.
        'transition-[opacity,transform] duration-700 ease-(--ease-brand)',
        isRevealed ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
