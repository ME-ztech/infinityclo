'use server';

/**
 * Actions over data this application owns: offers (drafts and activation),
 * storefront content, drops, community moderation, subscribers, the inbox and
 * staff. Each runs inside `runAction` (same-origin, permission, audit).
 */
import { revalidatePath } from 'next/cache';

import { products as catalogueProducts } from '@/data/adapters/local/snapshot';
import type { OfferInput } from '@/domain/offers';
import { CATEGORY_GROUPS, type CategoryGroup } from '@/domain/taxonomy';
import { checked, dateTime, field, integer, runAction } from '@/server/admin/action';
import { createStaff, deleteStaff, updateStaff } from '@/server/admin/auth';
import { acknowledgeMargin, activateOffer, endOffer, pauseOffer } from '@/server/admin/offers';
import { HOMEPAGE_SECTIONS, getSiteContent, safeImageUrl, saveSiteContent, type HomepageSectionId } from '@/server/cms';
import { createOfferDraft, deleteOfferDraft, updateOfferDraft } from '@/server/offers';
import {
  DROP_STAGES,
  DROP_TRANSITIONS,
  deleteDrop,
  getDrop,
  getSubmission,
  getTicket,
  newDrop,
  saveDrop,
  saveSubmission,
  saveTicket,
  setLegacyWallHidden,
  unsubscribe,
  type DropStage,
} from '@/server/records';
import { maskEmail, normaliseEmail } from '@/server/security';

const strings = (form: FormData, name: string, max = 60): string[] =>
  form
    .getAll(name)
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, max);

const slugs = (form: FormData, name: string, max = 60): string[] =>
  strings(form, name, max).filter((value) => /^[a-z0-9-]+$/.test(value));

function refreshStorefront(): void {
  revalidatePath('/', 'layout');
}

/* ------------------------------------------------------------------ *
 * Offers
 * ------------------------------------------------------------------ */

function offerInput(form: FormData): OfferInput {
  const kind = field(form, 'kind', 12) === 'bundle' ? 'bundle' : 'percentage';
  const method = kind === 'bundle' || field(form, 'method', 12) === 'automatic' ? 'automatic' : 'code';
  const scopeRaw = field(form, 'scope', 12);
  const scope = scopeRaw === 'products' || scopeRaw === 'categories' ? scopeRaw : 'all';
  const groups = CATEGORY_GROUPS.map((group) => group.id);
  const usageRaw = field(form, 'usageLimit', 10);
  return {
    kind,
    title: field(form, 'title', 120),
    method,
    code: method === 'code' ? field(form, 'code', 32).toUpperCase() : null,
    percentOff: integer(form, 'percentOff') ?? NaN,
    minQuantity: kind === 'bundle' ? integer(form, 'minQuantity') : null,
    audience: field(form, 'audience', 12) === 'first_order' ? 'first_order' : 'everyone',
    eligibility: {
      scope,
      productSlugs: scope === 'products' ? slugs(form, 'productSlugs', 250) : [],
      categories: scope === 'categories' ? (strings(form, 'categories').filter((value) => groups.includes(value as CategoryGroup)) as CategoryGroup[]) : [],
      excludeSaleItems: checked(form, 'excludeSaleItems'),
    },
    startsAt: dateTime(form, 'startsAt'),
    endsAt: dateTime(form, 'endsAt'),
    usageLimit: usageRaw ? (integer(form, 'usageLimit') ?? NaN) : null,
    oncePerCustomer: checked(form, 'oncePerCustomer'),
    combinesWith: {
      productDiscounts: checked(form, 'combineProduct'),
      orderDiscounts: checked(form, 'combineOrder'),
      shippingDiscounts: checked(form, 'combineShipping'),
    },
    showOnStorefront: checked(form, 'showOnStorefront'),
    internalNote: field(form, 'internalNote', 1000),
  };
}

export async function createOfferAction(form: FormData): Promise<void> {
  await runAction({ permission: 'offers.edit', action: 'offer.create', back: '/admin/promotions/new' }, async ({ session }) => {
    const offer = await createOfferDraft(offerInput(form), session.email);
    return { to: `/admin/promotions/${offer.id}`, message: 'Draft saved. It is not live.', target: `offer:${offer.id}`, detail: `Draft created: ${offer.title}.` };
  });
}

export async function updateOfferAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 60);
  await runAction({ permission: 'offers.edit', action: 'offer.update', back: `/admin/promotions/${id}`, target: `offer:${id}` }, async () => {
    // Any edit invalidates the margin sign-off: it was given for the old terms.
    const offer = await updateOfferDraft(id, offerInput(form));
    if (offer.marginCheckedBy) {
      const { saveOffer } = await import('@/server/offers');
      await saveOffer({ ...offer, marginCheckedBy: null });
    }
    return { message: 'Draft updated. The margin check must be recorded again before activation.', detail: `Draft edited: ${offer.title}.` };
  });
}

export async function deleteOfferAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 60);
  await runAction({ permission: 'offers.edit', action: 'offer.delete', back: `/admin/promotions/${id}`, target: `offer:${id}` }, async () => {
    if (field(form, 'confirm', 20) !== 'DELETE') throw new Error('Type DELETE to confirm.');
    await deleteOfferDraft(id);
    return { to: '/admin/promotions', message: 'Offer deleted.' };
  });
}

export async function marginCheckAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 60);
  await runAction({ permission: 'offers.activate', action: 'offer.margin_check', back: `/admin/promotions/${id}`, target: `offer:${id}` }, async ({ session }) => {
    if (!checked(form, 'marginChecked')) throw new Error('Tick the box to record the margin check.');
    await acknowledgeMargin(id, session);
    return { message: 'Margin check recorded.', detail: `Margin check recorded by ${maskEmail(session.email)}.` };
  });
}

export async function activateOfferAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 60);
  await runAction({ permission: 'offers.activate', action: 'offer.activate', back: `/admin/promotions/${id}`, commerce: true, target: `offer:${id}` }, async ({ session, gateway }) => {
    const offer = await activateOffer(id, session, field(form, 'confirm', 20), gateway);
    refreshStorefront();
    return {
      message: offer.sandbox ? 'Activated in the SANDBOX. No real discount exists and shoppers are unaffected.' : 'Offer is LIVE. The discount now exists in Shopify.',
      detail: `Activated; discount ${offer.shopifyDiscountId ?? 'n/a'}${offer.sandbox ? ' (sandbox)' : ''}.`,
    };
  });
}

export async function pauseOfferAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 60);
  await runAction({ permission: 'offers.activate', action: 'offer.pause', back: `/admin/promotions/${id}`, commerce: true, target: `offer:${id}` }, async ({ session, gateway }) => {
    await pauseOffer(id, session, gateway);
    refreshStorefront();
    return { message: 'Offer paused. The discount is deactivated.' };
  });
}

export async function endOfferAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 60);
  await runAction({ permission: 'offers.activate', action: 'offer.end', back: `/admin/promotions/${id}`, commerce: true, target: `offer:${id}` }, async ({ session, gateway }) => {
    if (field(form, 'confirm', 20) !== 'END') throw new Error('Type END to confirm.');
    await endOffer(id, session, gateway);
    refreshStorefront();
    return { message: 'Offer ended. The discount has been removed.' };
  });
}

/* ------------------------------------------------------------------ *
 * Content
 * ------------------------------------------------------------------ */

const catalogueMedia = new Map(
  catalogueProducts.flatMap((product) => product.media.map((media) => [media.url, media] as const)),
);

/** Reads `<prefix>.url` / `<prefix>.alt` into a content image, sized from the catalogue when known. */
function imageFrom(form: FormData, prefix: string): { url: string; alt: string; width: number; height: number } | 'rejected' | null {
  const raw = field(form, `${prefix}.url`, 400);
  if (!raw) return null;
  const url = safeImageUrl(raw);
  if (!url) return 'rejected';
  const known = catalogueMedia.get(url);
  return { url, alt: field(form, `${prefix}.alt`, 200) || known?.alt || '', width: known?.width ?? 1600, height: known?.height ?? 1600 };
}

function move<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export async function saveContentAction(form: FormData): Promise<void> {
  await runAction({ permission: 'content.edit', action: 'content.save', back: '/admin/content', target: 'content:site' }, async ({ session }) => {
    const current = await getSiteContent();
    let rejected = 0;

    const slideCount = Math.min(integer(form, 'slideCount') ?? 0, 6);
    let slides: unknown[] = [];
    for (let index = 0; index < slideCount; index += 1) {
      const prefix = `slide.${index}`;
      if (checked(form, `${prefix}.remove`)) continue;
      const images = [0, 1, 2]
        .map((slot) => imageFrom(form, `${prefix}.image.${slot}`))
        .filter((image) => (image === 'rejected' ? ((rejected += 1), false) : image !== null));
      if (images.length === 0) continue;
      slides.push({
        id: field(form, `${prefix}.id`, 60) || `slide-${Date.now().toString(36)}-${index}`,
        enabled: checked(form, `${prefix}.enabled`),
        images,
        focalPoint: { x: integer(form, `${prefix}.focalX`) ?? 50, y: integer(form, `${prefix}.focalY`) ?? 22 },
        overlay: integer(form, `${prefix}.overlay`) ?? 0,
        tone: field(form, `${prefix}.tone`, 6),
        eyebrow: field(form, `${prefix}.eyebrow`, 60),
        title: field(form, `${prefix}.title`, 80),
        ctaLabel: field(form, `${prefix}.ctaLabel`, 40),
        ctaHref: field(form, `${prefix}.ctaHref`, 300),
      });
    }

    let sections = strings(form, 'sectionOrder', 20)
      .filter((id): id is HomepageSectionId => (HOMEPAGE_SECTIONS as readonly string[]).includes(id))
      .map((id) => ({ id, enabled: checked(form, `section.${id}.enabled`) }));

    // Reorder buttons submit the whole form, so nothing typed is lost.
    const [operation, argument] = field(form, 'op', 60).split(':');
    if (operation === 'slide-up' || operation === 'slide-down') {
      slides = move(slides, slides.findIndex((slide) => (slide as { id: string }).id === argument), operation === 'slide-up' ? -1 : 1);
    }
    if (operation === 'section-up' || operation === 'section-down') {
      sections = move(sections, sections.findIndex((section) => section.id === argument), operation === 'section-up' ? -1 : 1);
    }

    const lookbookCount = Math.min(integer(form, 'lookbookCount') ?? 0, 14);
    const lookbook: unknown[] = [];
    for (let index = 0; index < lookbookCount; index += 1) {
      if (checked(form, `lookbook.${index}.remove`)) continue;
      const image = imageFrom(form, `lookbook.${index}`);
      if (image === 'rejected') rejected += 1;
      else if (image) lookbook.push({ ...image, productSlug: field(form, `lookbook.${index}.productSlug`, 120) || null });
    }

    await saveSiteContent(
      {
        announcement: { enabled: checked(form, 'announcement.enabled'), text: field(form, 'announcement.text', 140), href: field(form, 'announcement.href', 300) },
        hero: { autoAdvanceSeconds: integer(form, 'hero.autoAdvanceSeconds') ?? current.hero.autoAdvanceSeconds, slides },
        statement: { headline: field(form, 'statement.headline', 80), body: field(form, 'statement.body', 500) },
        sections,
        featured: { heading: field(form, 'featured.heading', 60), productSlugs: slugs(form, 'featured.productSlugs', 12) },
        vault: { heading: field(form, 'vault.heading', 60), body: field(form, 'vault.body', 240), ctaLabel: field(form, 'vault.ctaLabel', 40) },
        lookbook: { heading: field(form, 'lookbook.heading', 60), body: field(form, 'lookbook.body', 300), images: lookbook },
        community: { heading: field(form, 'community.heading', 60), body: field(form, 'community.body', 300) },
        newsletter: { heading: field(form, 'newsletter.heading', 60), body: field(form, 'newsletter.body', 300) },
        upsell: { productPage: checked(form, 'upsell.productPage'), cart: checked(form, 'upsell.cart') },
        social: { instagram: field(form, 'social.instagram', 300), facebook: field(form, 'social.facebook', 300), threads: field(form, 'social.threads', 300) },
        contact: { email: normaliseEmail(field(form, 'contact.email', 254)) ?? '', note: field(form, 'contact.note', 300) },
      },
      session.email,
    );
    refreshStorefront();

    const emailRaw = field(form, 'contact.email', 254);
    const notes = [
      rejected ? `${rejected} image link(s) were not saved: images must be on this site or cdn.shopify.com.` : '',
      emailRaw && !normaliseEmail(emailRaw) ? 'The contact email was not a valid address and was cleared.' : '',
    ].filter(Boolean);
    return { message: ['Storefront content saved.', ...notes].join(' '), detail: `Homepage content saved (${slides.length} slides, ${lookbook.length} lookbook images).` };
  });
}

/* ------------------------------------------------------------------ *
 * Drops
 * ------------------------------------------------------------------ */

export async function createDropAction(form: FormData): Promise<void> {
  await runAction({ permission: 'drops.edit', action: 'drop.create', back: '/admin/drops' }, async ({ session }) => {
    const name = field(form, 'internalName', 80);
    if (!name) throw new Error('Give the drop an internal working name.');
    const drop = await saveDrop(newDrop(name, session.email));
    return { to: `/admin/drops/${drop.id}`, message: 'Drop created as a draft. Nothing is public.', target: `drop:${drop.id}` };
  });
}

export async function updateDropAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 60);
  await runAction({ permission: 'drops.edit', action: 'drop.update', back: `/admin/drops/${id}`, target: `drop:${id}` }, async ({ session }) => {
    const drop = await getDrop(id);
    if (!drop) throw new Error('Drop not found.');
    const internalName = field(form, 'internalName', 80);
    if (!internalName) throw new Error('The internal name cannot be empty.');

    const image = imageFrom(form, 'image');
    if (image === 'rejected') throw new Error('The image must be on this site or cdn.shopify.com.');
    if (image && !image.alt) throw new Error('Describe the image for customers using screen readers.');

    const releaseAt = dateTime(form, 'releaseAt');
    const releaseConfirmed = checked(form, 'releaseConfirmed');
    if (releaseConfirmed && !releaseAt) throw new Error('Set the release date and time before confirming it.');

    const productSlug = field(form, 'productSlug', 120);
    if (productSlug && !/^[a-z0-9-]+$/.test(productSlug)) throw new Error('The product handle uses lowercase letters, numbers and hyphens.');

    await saveDrop({
      ...drop,
      internalName,
      publicName: field(form, 'publicName', 80) || null,
      teaser: field(form, 'teaser', 300) || null,
      image,
      releaseAt,
      releaseConfirmed,
      productSlug: productSlug || null,
      waitlistEnabled: checked(form, 'waitlistEnabled'),
      updatedAt: new Date().toISOString(),
      updatedBy: session.email,
    });
    refreshStorefront();
    return { message: 'Drop saved.' };
  });
}

export async function transitionDropAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 60);
  await runAction({ permission: 'drops.edit', action: 'drop.transition', back: `/admin/drops/${id}`, target: `drop:${id}` }, async ({ session }) => {
    const drop = await getDrop(id);
    if (!drop) throw new Error('Drop not found.');
    const stage = field(form, 'stage', 20) as DropStage;
    if (!DROP_STAGES.includes(stage) || !DROP_TRANSITIONS[drop.stage].includes(stage)) {
      throw new Error(`A drop cannot move from “${drop.stage}” to “${stage}”.`);
    }
    if ((stage === 'published' || stage === 'sold_out') && !drop.productSlug) {
      throw new Error('Link the Shopify product (its handle) before marking the drop published.');
    }
    await saveDrop({ ...drop, stage, updatedAt: new Date().toISOString(), updatedBy: session.email });
    refreshStorefront();
    return { message: `Drop moved to “${stage.replace('_', ' ')}”.`, detail: `${drop.stage} -> ${stage}.` };
  });
}

export async function deleteDropAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 60);
  await runAction({ permission: 'drops.edit', action: 'drop.delete', back: `/admin/drops/${id}`, target: `drop:${id}` }, async () => {
    const drop = await getDrop(id);
    if (!drop) return { to: '/admin/drops', message: 'Drop already removed.' };
    if (drop.stage !== 'draft' && drop.stage !== 'archived') throw new Error('Only a draft or archived drop can be deleted.');
    if (field(form, 'confirm', 20) !== 'DELETE') throw new Error('Type DELETE to confirm.');
    await deleteDrop(id);
    return { to: '/admin/drops', message: 'Drop deleted. Its waitlist entries are kept for export.' };
  });
}

/* ------------------------------------------------------------------ *
 * Community
 * ------------------------------------------------------------------ */

export async function legacyWallAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 60);
  await runAction({ permission: 'community.moderate', action: 'community.legacy', back: '/admin/community', target: `community:${id}` }, async () => {
    if (!/^troop-\d+$/.test(id)) throw new Error('Unknown wall entry.');
    const hidden = field(form, 'hidden', 5) === 'true';
    await setLegacyWallHidden(id, hidden);
    refreshStorefront();
    return { message: hidden ? 'Hidden from the wall.' : 'Shown on the wall again.', detail: hidden ? 'Hidden.' : 'Unhidden.' };
  });
}

export async function moderateSubmissionAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 60);
  await runAction({ permission: 'community.moderate', action: 'community.moderate', back: '/admin/community#submissions', target: `community:${id}` }, async ({ session }) => {
    const submission = await getSubmission(id);
    if (!submission) throw new Error('Submission not found.');
    const decision = field(form, 'decision', 20);
    const reviewed = { reviewedAt: new Date().toISOString(), reviewedBy: session.email };
    const productSlugs = slugs(form, 'productSlugs', 6);

    if (decision === 'approve') {
      await saveSubmission({ ...submission, ...reviewed, status: 'approved', productSlugs });
    } else if (decision === 'hide') {
      await saveSubmission({ ...submission, ...reviewed, status: 'hidden' });
    } else if (decision === 'confirm_rights') {
      await saveSubmission({ ...submission, ...reviewed, rights: 'owner_confirmed' });
    } else if (decision === 'tag') {
      await saveSubmission({ ...submission, ...reviewed, productSlugs });
    } else {
      throw new Error('Unknown moderation decision.');
    }
    refreshStorefront();
    return { message: { approve: 'Approved. It now appears on the wall.', hide: 'Hidden.', confirm_rights: 'Rights marked as confirmed by the owner.', tag: 'Product tags saved.' }[decision]!, detail: decision };
  });
}

/* ------------------------------------------------------------------ *
 * Marketing, inbox
 * ------------------------------------------------------------------ */

export async function unsubscribeAction(form: FormData): Promise<void> {
  await runAction({ permission: 'marketing.export', action: 'subscriber.unsubscribe', back: '/admin/marketing' }, async () => {
    const email = normaliseEmail(field(form, 'email', 254));
    if (!email) throw new Error('Unknown subscriber.');
    const changed = await unsubscribe(email);
    return { message: changed ? 'Unsubscribed. The record is kept as proof of the change.' : 'Already unsubscribed.', target: `subscriber:${maskEmail(email)}`, detail: 'Unsubscribed by staff.' };
  });
}

export async function updateTicketAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 60);
  await runAction({ permission: 'tickets.edit', action: 'ticket.update', back: `/admin/inbox/${id}`, target: `ticket:${id}` }, async ({ session }) => {
    const ticket = await getTicket(id);
    if (!ticket) throw new Error('Ticket not found.');
    const statusRaw = field(form, 'status', 20);
    const status = statusRaw === 'open' || statusRaw === 'in_progress' || statusRaw === 'closed' ? statusRaw : ticket.status;
    const note = field(form, 'note', 2000);
    await saveTicket({
      ...ticket,
      status,
      notes: note ? [...ticket.notes, { at: new Date().toISOString(), by: session.email, text: note }] : ticket.notes,
    });
    return { message: note ? 'Note added.' : 'Ticket updated.', detail: `Status ${status}${note ? '; note added' : ''}.` };
  });
}

/* ------------------------------------------------------------------ *
 * Staff
 * ------------------------------------------------------------------ */

export async function createStaffAction(form: FormData): Promise<void> {
  await runAction({ permission: 'staff.manage', action: 'staff.create', back: '/admin/settings#staff' }, async ({ session }) => {
    const member = await createStaff(
      { email: field(form, 'email', 254), name: field(form, 'name', 80), role: field(form, 'role', 20), password: form.get('password') },
      session.email,
    );
    return { message: `Created ${member.email} as ${member.role}. Share the password with them securely.`, target: `staff:${member.id}`, detail: `Created ${maskEmail(member.email)} (${member.role}).` };
  });
}

export async function updateStaffAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 60);
  await runAction({ permission: 'staff.manage', action: 'staff.update', back: '/admin/settings#staff', target: `staff:${id}` }, async ({ session }) => {
    if (id === session.id) throw new Error('You cannot change your own role or access. Ask another Owner.');
    const operation = field(form, 'operation', 20);
    if (operation === 'role') await updateStaff(id, { role: field(form, 'role', 20) });
    else if (operation === 'disable') await updateStaff(id, { disabled: true });
    else if (operation === 'enable') await updateStaff(id, { disabled: false });
    else if (operation === 'password') await updateStaff(id, { password: form.get('password') });
    else throw new Error('Unknown staff change.');
    return { message: { role: 'Role changed.', disable: 'Account disabled. Their session ends immediately.', enable: 'Account enabled.', password: 'Password changed. Their existing session ends immediately.' }[operation]!, detail: operation };
  });
}

export async function deleteStaffAction(form: FormData): Promise<void> {
  const id = field(form, 'id', 60);
  await runAction({ permission: 'staff.manage', action: 'staff.delete', back: '/admin/settings#staff', target: `staff:${id}` }, async ({ session }) => {
    if (id === session.id) throw new Error('You cannot delete your own account.');
    if (field(form, 'confirm', 20) !== 'DELETE') throw new Error('Type DELETE to confirm.');
    await deleteStaff(id);
    return { message: 'Staff account deleted.' };
  });
}
