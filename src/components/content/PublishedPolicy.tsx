import policiesJson from '@/data/catalog/policies.json';

/**
 * Renders one of the merchant's own Shopify policies exactly as published on
 * infinityclo.ca (imported by `npm run import:content`). Not paraphrased: these
 * are the store's actual terms, flagged for owner/legal review.
 */
type Block = { type: 'heading'; text: string } | { type: 'paragraph'; text: string } | { type: 'list'; items: string[] };
interface Policy {
  handle: string;
  title: string;
  blocks: Block[];
  sourceUrl: string;
  fetchedAt: string;
}

const policies = policiesJson as Policy[];

export function getPolicy(handle: string): Policy | null {
  return policies.find((policy) => policy.handle === handle) ?? null;
}

export function PublishedPolicy({ handle }: { handle: string }) {
  const policy = getPolicy(handle);
  if (!policy) return <p className="text-fg-muted text-sm">This policy has not been imported.</p>;
  return (
    <div className="flex flex-col gap-4 text-sm leading-relaxed" data-testid={`policy-${handle}`}>
      {policy.blocks.map((block, index) =>
        block.type === 'heading' ? (
          <h2 key={index} className="text-fg mt-4 text-sm font-semibold tracking-[0.06em] uppercase">
            {block.text}
          </h2>
        ) : block.type === 'list' ? (
          <ul key={index} className="text-fg-muted list-disc pl-5">
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={index} className="text-fg-muted">
            {block.text}
          </p>
        ),
      )}
      <p className="text-fg-faint border-line mt-6 border-t pt-4 text-xs">
        This is the policy currently published by Infnity.clo on its Shopify store (imported {policy.fetchedAt.slice(0, 10)}). It is pending
        owner and legal review for the new site.
      </p>
    </div>
  );
}
