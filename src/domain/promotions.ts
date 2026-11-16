/**
 * Promotions — drafts, approval rules, storefront previews and the mapping to
 * native Shopify discounts.
 *
 * The rules this module holds to:
 *
 * 1. A promotion is DRAFT until an owner approves it with an explicit margin
 *    acknowledgement. Nothing about a draft reaches a shopper.
 * 2. Every promotion maps to a *native* Shopify discount, so Shopify's checkout
 *    computes the real number. The storefront only ever shows an *estimate*
 *    labelled as such, and only for promotions that are live in Shopify.
 * 3. No value is invented. A bundle with no percentage set cannot be approved.
 */
import { z } from 'zod';

import type { Money } from './types';

export const PROMOTION_KINDS = ['percentage', 'bundle', 'gift_with_purchase'] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

export const PROMOTION_STATUSES = ['draft', 'approved', 'live', 'paused', 'ended'] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Use a valid date and time.')
  .nullable();

const scopeSchema = z.object({
  /** all products, or a list of product handles */
  type: z.enum(['all', 'products']),
  productHandles: z.array(z.string().min(1)).default([]),
  /** Exclude items already on sale (compare-at above price). */
  excludeSaleItems: z.boolean().default(true),
});

const combinesSchema = z.object({
  orderDiscounts: z.boolean().default(false),
  productDiscounts: z.boolean().default(false),
  shippingDiscounts: z.boolean().default(true),
});

const baseSchema = z.object({
  title: z.string().trim().min(2, 'Give the offer a customer-facing title.').max(80),
  method: z.enum(['automatic', 'code']),
  code: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Z0-9_-]*$/i, 'Codes use letters, numbers, - and _ only.')
    .default(''),
  startsAt: dateString.default(null),
  endsAt: dateString.default(null),
  usageLimit: z.number().int().positive().nullable().default(null),
  oncePerCustomer: z.boolean().default(false),
  scope: scopeSchema.default({ type: 'all', productHandles: [], excludeSaleItems: true }),
  combinesWith: combinesSchema.default({ orderDiscounts: false, productDiscounts: false, shippingDiscounts: true }),
});

export const percentageConfigSchema = baseSchema.extend({
  kind: z.literal('percentage'),
  percent: z.number().min(1).max(90).nullable(),
  /** `first_order` uses a Shopify customer segment of customers with zero orders. */
  eligibility: z.enum(['all', 'first_order']).default('all'),
  minimumSubtotalCents: z.number().int().nonnegative().nullable().default(null),
});

export const bundleConfigSchema = baseSchema.extend({
  kind: z.literal('bundle'),
  minimumQuantity: z.number().int().min(2).max(10),
  /** Percent off each eligible item once the quantity is met, or a fixed amount off the order. */
  value: z.discriminatedUnion('type', [
    z.object({ type: z.literal('percentage'), percent: z.number().min(1).max(90).nullable() }),
    z.object({ type: z.literal('amount_off_order'), amountCents: z.number().int().positive().nullable() }),
  ]),
});

export const giftConfigSchema = baseSchema.extend({
  kind: z.literal('gift_with_purchase'),
  minimumSubtotalCents: z.number().int().positive(),
  giftProductHandle: z.string().min(1),
});

export const promotionConfigSchema = z.discriminatedUnion('kind', [
  percentageConfigSchema,
  bundleConfigSchema,
  giftConfigSchema,
]);

export type PromotionConfig = z.infer<typeof promotionConfigSchema>;

export interface PromotionRecord {
  readonly id: string;
  readonly name: string;
  readonly status: PromotionStatus;
  readonly config: PromotionConfig;
  readonly marginAcknowledged: boolean;
  readonly shopifyDiscountId: string | null;
}

/* ------------------------------------------------------------------ *
 * Approval
 * ------------------------------------------------------------------ */

/** Everything that must be true before an owner may approve. Empty = approvable. */
export function approvalProblems(config: PromotionConfig, marginAcknowledged: boolean): string[] {
  const problems: string[] = [];
  if (!marginAcknowledged) problems.push('Confirm you have checked the margin impact of this offer.');
  if (config.method === 'code' && !config.code) problems.push('Set a discount code, or switch the method to automatic.');
  if (config.startsAt && config.endsAt && Date.parse(config.endsAt) <= Date.parse(config.startsAt)) {
    problems.push('The end date must be after the start date.');
  }
  if (config.scope.type === 'products' && config.scope.productHandles.length === 0) {
    problems.push('Choose at least one product, or apply the offer to all products.');
  }
  switch (config.kind) {
    case 'percentage':
      if (config.percent === null) problems.push('Set the percentage.');
      if (config.eligibility === 'first_order' && config.method !== 'code') {
        problems.push('First-order offers need a code so Shopify can check the customer at checkout.');
      }
      break;
    case 'bundle':
      if (config.value.type === 'percentage' && config.value.percent === null) problems.push('Set the bundle percentage.');
      if (config.value.type === 'amount_off_order' && config.value.amountCents === null) problems.push('Set the bundle amount.');
      break;
    case 'gift_with_purchase':
      break;
  }
  return problems;
}

/** A sitewide, always-on offer is called out explicitly at approval time. */
export function isSitewidePersistent(config: PromotionConfig): boolean {
  return config.method === 'automatic' && config.scope.type === 'all' && !config.endsAt;
}

/* ------------------------------------------------------------------ *
 * Storefront preview (estimates only)
 * ------------------------------------------------------------------ */

export interface PreviewLine {
  readonly productSlug: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly compareAtUnitPrice: Money | null;
}

export interface OfferPreview {
  readonly promotionId: string;
  readonly title: string;
  readonly kind: PromotionKind;
  /** Estimated saving in minor units; 0 when not yet qualified. */
  readonly estimatedSavingCents: number;
  readonly qualified: boolean;
  /** Plain-language progress or explanation, e.g. "Add 1 more eligible piece". */
  readonly message: string;
  readonly code: string | null;
}

function isActiveNow(config: PromotionConfig, now: Date): boolean {
  if (config.startsAt && Date.parse(config.startsAt) > now.getTime()) return false;
  if (config.endsAt && Date.parse(config.endsAt) <= now.getTime()) return false;
  return true;
}

function eligibleLines(config: PromotionConfig, lines: readonly PreviewLine[]): PreviewLine[] {
  return lines.filter((line) => {
    if (config.scope.type === 'products' && !config.scope.productHandles.includes(line.productSlug)) return false;
    if (config.scope.excludeSaleItems && line.compareAtUnitPrice && line.compareAtUnitPrice.amount > line.unitPrice.amount) {
      return false;
    }
    return true;
  });
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Estimates what live promotions would do to a cart. Only `live` promotions
 * are considered; Shopify's checkout is the final word on the real number.
 */
export function previewOffers(
  promotions: readonly PromotionRecord[],
  lines: readonly PreviewLine[],
  now: Date = new Date(),
): OfferPreview[] {
  const previews: OfferPreview[] = [];
  for (const promotion of promotions) {
    if (promotion.status !== 'live') continue;
    const config = promotion.config;
    if (!isActiveNow(config, now)) continue;

    const eligible = eligibleLines(config, lines);
    const eligibleQuantity = eligible.reduce((sum, line) => sum + line.quantity, 0);
    const eligibleSubtotal = eligible.reduce((sum, line) => sum + line.unitPrice.amount * line.quantity, 0);
    const cartSubtotal = lines.reduce((sum, line) => sum + line.unitPrice.amount * line.quantity, 0);
    const code = config.method === 'code' ? config.code : null;

    if (config.kind === 'percentage') {
      if (config.percent === null) continue;
      const meetsMinimum = config.minimumSubtotalCents === null || eligibleSubtotal >= config.minimumSubtotalCents;
      // First-order eligibility is decided by Shopify at checkout; never pre-promise it.
      const qualified = meetsMinimum && config.eligibility === 'all' && eligibleQuantity > 0;
      previews.push({
        promotionId: promotion.id,
        title: config.title,
        kind: config.kind,
        estimatedSavingCents: qualified ? Math.round((eligibleSubtotal * config.percent) / 100) : 0,
        qualified,
        code,
        message:
          config.eligibility === 'first_order'
            ? `${config.percent}% off a first order${code ? ` with code ${code}` : ''}. Eligibility is confirmed at checkout.`
            : !meetsMinimum && config.minimumSubtotalCents !== null
              ? `Spend ${formatCents(config.minimumSubtotalCents - eligibleSubtotal)} more on eligible pieces for ${config.percent}% off.`
              : `${config.percent}% off eligible pieces${code ? ` with code ${code}` : ''}.`,
      });
    } else if (config.kind === 'bundle') {
      const qualified = eligibleQuantity >= config.minimumQuantity;
      let saving = 0;
      let valueLabel = '';
      if (config.value.type === 'percentage' && config.value.percent !== null) {
        saving = qualified ? Math.round((eligibleSubtotal * config.value.percent) / 100) : 0;
        valueLabel = `${config.value.percent}% off each`;
      } else if (config.value.type === 'amount_off_order' && config.value.amountCents !== null) {
        saving = qualified ? Math.min(config.value.amountCents, eligibleSubtotal) : 0;
        valueLabel = `${formatCents(config.value.amountCents)} off`;
      } else {
        continue;
      }
      const remaining = config.minimumQuantity - eligibleQuantity;
      previews.push({
        promotionId: promotion.id,
        title: config.title,
        kind: config.kind,
        estimatedSavingCents: saving,
        qualified,
        code,
        message: qualified
          ? `Bundle applied: ${valueLabel} with ${config.minimumQuantity}+ eligible pieces.`
          : `Add ${remaining} more eligible ${remaining === 1 ? 'piece' : 'pieces'} for ${valueLabel}.`,
      });
    } else {
      const qualified = cartSubtotal >= config.minimumSubtotalCents;
      previews.push({
        promotionId: promotion.id,
        title: config.title,
        kind: config.kind,
        estimatedSavingCents: 0,
        qualified,
        code,
        message: qualified
          ? `You qualify for ${config.title}. Add the gift to your cart to claim it.`
          : `Spend ${formatCents(config.minimumSubtotalCents - cartSubtotal)} more for ${config.title}.`,
      });
    }
  }
  return previews;
}

/**
 * Picks the estimated savings Shopify is likely to stack. Promotions that do
 * not combine with product discounts are not added together; the best single
 * one is shown instead. Always labelled as an estimate in the UI.
 */
export function estimatedTotalSaving(previews: readonly OfferPreview[], promotions: readonly PromotionRecord[]): number {
  const qualified = previews.filter((preview) => preview.qualified && preview.estimatedSavingCents > 0);
  if (qualified.length <= 1) return qualified[0]?.estimatedSavingCents ?? 0;
  const byId = new Map(promotions.map((promotion) => [promotion.id, promotion]));
  const allCombine = qualified.every((preview) => {
    const config = byId.get(preview.promotionId)?.config;
    return config ? config.combinesWith.productDiscounts && config.combinesWith.orderDiscounts : false;
  });
  return allCombine
    ? qualified.reduce((sum, preview) => sum + preview.estimatedSavingCents, 0)
    : Math.max(...qualified.map((preview) => preview.estimatedSavingCents));
}

/* ------------------------------------------------------------------ *
 * Shopify discount mapping
 * ------------------------------------------------------------------ */

export interface ShopifyDiscountPlan {
  /** Which Admin API mutation creates this discount. */
  readonly mutation:
    | 'discountAutomaticBasicCreate'
    | 'discountCodeBasicCreate'
    | 'discountAutomaticBxgyCreate'
    | 'discountCodeBxgyCreate';
  /** The `*Discount` input object, with product handles still to be resolved to gids. */
  readonly input: Record<string, unknown>;
  /** Product handles the caller must resolve to `gid://shopify/Product/…`. */
  readonly productHandles: readonly string[];
  /** True when a "customers with no orders" segment must be attached. */
  readonly needsFirstOrderSegment: boolean;
}

/** Pure mapping from an approved promotion to a native Shopify discount input. */
export function shopifyDiscountPlan(config: PromotionConfig, now: Date = new Date()): ShopifyDiscountPlan {
  const isCode = config.method === 'code';
  const common: Record<string, unknown> = {
    title: config.title,
    startsAt: config.startsAt ?? now.toISOString(),
    endsAt: config.endsAt,
    combinesWith: config.combinesWith,
    ...(isCode
      ? { code: config.code, usageLimit: config.usageLimit, appliesOncePerCustomer: config.oncePerCustomer }
      : {}),
  };
  const items =
    config.scope.type === 'all'
      ? { all: true }
      : { products: { productsToAdd: config.scope.productHandles } };

  if (config.kind === 'percentage') {
    return {
      mutation: isCode ? 'discountCodeBasicCreate' : 'discountAutomaticBasicCreate',
      input: {
        ...common,
        ...(isCode ? { context: { all: 'ALL' } } : {}),
        customerGets: { value: { percentage: (config.percent ?? 0) / 100 }, items },
        minimumRequirement:
          config.minimumSubtotalCents !== null
            ? { subtotal: { greaterThanOrEqualToSubtotal: (config.minimumSubtotalCents / 100).toFixed(2) } }
            : null,
      },
      productHandles: config.scope.productHandles,
      needsFirstOrderSegment: config.eligibility === 'first_order',
    };
  }

  if (config.kind === 'bundle') {
    const value =
      config.value.type === 'percentage'
        ? { percentage: (config.value.percent ?? 0) / 100 }
        : { discountAmount: { amount: ((config.value.amountCents ?? 0) / 100).toFixed(2), appliesOnEachItem: false } };
    return {
      mutation: isCode ? 'discountCodeBasicCreate' : 'discountAutomaticBasicCreate',
      input: {
        ...common,
        ...(isCode ? { context: { all: 'ALL' } } : {}),
        customerGets: { value, items },
        minimumRequirement: { quantity: { greaterThanOrEqualToQuantity: String(config.minimumQuantity) } },
      },
      productHandles: config.scope.productHandles,
      needsFirstOrderSegment: false,
    };
  }

  return {
    mutation: isCode ? 'discountCodeBxgyCreate' : 'discountAutomaticBxgyCreate',
    input: {
      ...common,
      ...(isCode ? { context: { all: 'ALL' } } : {}),
      customerBuys: { value: { amount: (config.minimumSubtotalCents / 100).toFixed(2) }, items: { all: true } },
      customerGets: {
        value: { discountOnQuantity: { quantity: '1', effect: { percentage: 1 } } },
        items: { products: { productsToAdd: [config.giftProductHandle] } },
      },
      usesPerOrderLimit: '1',
    },
    productHandles: [config.giftProductHandle],
    needsFirstOrderSegment: false,
  };
}

/** Seed drafts reflecting the owner's notes and the live store. Values the owner has not decided stay null. */
export function seedPromotionDrafts(): Array<{ name: string; config: PromotionConfig }> {
  return [
    {
      name: '10% off — first order (from owner notes)',
      config: percentageConfigSchema.parse({
        kind: 'percentage',
        title: '10% off your first order',
        method: 'code',
        code: '',
        percent: 10,
        eligibility: 'first_order',
        oncePerCustomer: true,
      }),
    },
    {
      name: 'Bundle of 2 (from owner notes; value not yet decided)',
      config: bundleConfigSchema.parse({
        kind: 'bundle',
        title: 'Bundle of 2',
        method: 'automatic',
        minimumQuantity: 2,
        value: { type: 'percentage', percent: null },
      }),
    },
    {
      name: 'FREESKII — free crew socks over $100 (mirrors live AVADA campaign)',
      config: giftConfigSchema.parse({
        kind: 'gift_with_purchase',
        title: 'Free INFNITY crew socks',
        method: 'automatic',
        minimumSubtotalCents: 10000,
        giftProductHandle: 'infnity-crew-socks',
        combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
      }),
    },
  ];
}
