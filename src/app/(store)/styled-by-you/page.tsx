import type { Metadata } from 'next';
import Image from 'next/image';

import { SubmitFitForm } from '@/components/community/SubmitFitForm';
import { approvedPosts } from '@/server/community';

export const metadata: Metadata = {
  title: 'Styled By You',
  description:
    'The Troop in INFNITY — fits from the community. Post and tag @infnity.clo to be on the wall.',
  alternates: { canonical: '/styled-by-you' },
};

export const revalidate = 300;

export default async function StyledByYouPage() {
  const posts = await approvedPosts(120);
  return (
    <div className="pb-(--spacing-section)">
      <header className="edge mx-auto max-w-2xl pt-14 pb-10 text-center md:pt-20">
        <p className="text-fg-faint text-[0.66rem] font-semibold tracking-[0.32em] uppercase">
          The Troop in INFNITY
        </p>
        <h1 className="font-display mt-4 text-[clamp(2.6rem,9vw,5.4rem)] leading-[0.88]">
          Styled By You
        </h1>
        <p className="text-fg-muted mt-5 text-sm leading-relaxed">
          Wanna be added to the wall? Post and tag us @infnity.clo — or send your fit in below.
        </p>
      </header>

      {posts.length > 0 ? (
        <ul
          className="edge grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
          data-testid="community-wall"
        >
          {posts.map((post) => (
            <li key={post.id}>
              <figure>
                <div className="bg-surface-sunken relative aspect-[4/5] overflow-hidden">
                  <Image
                    src={post.imageUrl}
                    alt={post.alt}
                    fill
                    sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
                    className="object-cover"
                  />
                </div>
                {(post.handle || post.caption) && (
                  <figcaption className="text-fg-muted mt-1.5 text-xs">
                    {post.handle && <span className="text-fg font-medium">@{post.handle}</span>}{' '}
                    {post.caption}
                  </figcaption>
                )}
              </figure>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted text-center text-sm">
          The wall is being refreshed. Check back soon.
        </p>
      )}

      <section
        id="submit"
        aria-labelledby="submit-heading"
        className="edge mx-auto mt-20 max-w-xl scroll-mt-28"
      >
        <h2
          id="submit-heading"
          className="font-display text-center text-[clamp(2rem,6vw,3rem)] leading-[0.92]"
        >
          Submit your fit
        </h2>
        <p className="text-fg-muted mt-4 mb-8 text-center text-sm">
          Only with your permission. You can ask us to take it down at any time.
        </p>
        <SubmitFitForm />
      </section>
    </div>
  );
}
