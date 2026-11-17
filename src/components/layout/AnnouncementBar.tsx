import Link from 'next/link';

import type { AnnouncementContent } from '@/domain/cms';

/** Owner-controlled line above the header (Admin → Content → Announcement bar). */
export function AnnouncementBar({ content }: { content: AnnouncementContent }) {
  if (!content.enabled || !content.text) return null;
  const inner = <span>{content.text}</span>;
  return (
    <div
      data-surface="void"
      data-testid="announcement-bar"
      className="bg-surface text-fg px-4 py-2 text-center text-[0.68rem] font-semibold tracking-[0.16em] uppercase"
    >
      {content.href ? (
        <Link href={content.href} className="underline-offset-4 hover:underline">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </div>
  );
}
