import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { getCms } from '@/server/content/cms';

export const metadata: Metadata = { title: 'Lookbook', description: 'The INFNITY lookbook.', alternates: { canonical: '/lookbook' } };
export const revalidate = 300;

export default async function LookbookPage() {
  const { value } = await getCms('lookbook');
  return (
    <div className="pb-(--spacing-section)">
      <header className="edge mx-auto max-w-2xl pt-14 pb-12 text-center md:pt-20">
        <h1 className="font-display text-[clamp(2.6rem,9vw,5.4rem)] leading-[0.88]">{value.title}</h1>
        {value.intro && <p className="text-fg-muted mt-5 text-sm leading-relaxed">{value.intro}</p>}
      </header>
      <ul className="edge grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {value.images.map((image, index) => (
          <li key={`${image.url}-${index}`}>
            <figure>
              <div className="bg-surface-sunken relative aspect-[4/5] overflow-hidden">
                <Image src={image.url} alt={image.alt} fill sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover object-top" />
              </div>
              <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-fg-muted">{image.caption}</span>
                {image.productHandles.map((handle) => (
                  <Link key={handle} href={`/products/${handle}`} className="font-display text-[0.75rem] underline underline-offset-4">
                    Shop the look
                  </Link>
                ))}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}
