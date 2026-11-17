/**
 * Order pricing.
 *
 * One pure function turns priced lines, a discount, a shipping rate and the
 * destination's tax rates into the totals an order is charged. The server calls
 * it when a checkout is created and again whenever the address, shipping method
 * or discount changes; the payment is then raised for exactly `totalCents`.
 *
 * Everything is an integer number of cents. Percentages are applied per line
 * and rounded half-up to the cent, so the line discounts always sum to the
 * order discount and a refund of one line is unambiguous.
 */

export interface PricingLine {
  readonly key: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
  /** Whether the active discount applies to this line. */
  readonly discountEligible: boolean;
}

export interface PricingDiscount {
  readonly percentOff: number;
  /** Eligible units required before the discount applies (bundles). */
  readonly minQuantity: number;
}

export interface PricingShippingRate {
  readonly priceCents: number;
  /** Discounted subtotal at or above which shipping is free. */
  readonly freeOverCents: number | null;
}

export interface PricingTaxRate {
  readonly name: string;
  /** Basis points: 500 = 5%. */
  readonly rateBps: number;
  readonly appliesToShipping: boolean;
}

export interface PricedLine {
  readonly key: string;
  readonly lineSubtotalCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
}

export interface OrderTotals {
  readonly lines: readonly PricedLine[];
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly discountApplied: boolean;
  readonly shippingCents: number;
  readonly taxLines: ReadonlyArray<{ name: string; rateBps: number; amountCents: number }>;
  readonly taxCents: number;
  readonly totalCents: number;
}

const assertCents = (value: number, what: string): void => {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${what} must be a non-negative whole number of cents.`);
};

/** Half-up rounding of `amount × numerator / denominator`, in integers. */
export function proportion(amountCents: number, numerator: number, denominator: number): number {
  return Math.floor((amountCents * numerator * 2 + denominator) / (denominator * 2));
}

export function priceOrder(input: {
  lines: readonly PricingLine[];
  discount: PricingDiscount | null;
  shipping: PricingShippingRate | null;
  taxRates: readonly PricingTaxRate[];
}): OrderTotals {
  for (const line of input.lines) {
    assertCents(line.unitPriceCents, 'Unit price');
    if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new Error('Quantity must be a positive whole number.');
  }

  const eligibleQuantity = input.lines
    .filter((line) => line.discountEligible)
    .reduce((total, line) => total + line.quantity, 0);
  const discountApplied =
    input.discount !== null &&
    input.discount.percentOff > 0 &&
    eligibleQuantity > 0 &&
    eligibleQuantity >= input.discount.minQuantity;

  const lines: PricedLine[] = input.lines.map((line) => {
    const lineSubtotalCents = line.unitPriceCents * line.quantity;
    const discountCents =
      discountApplied && line.discountEligible
        ? Math.min(lineSubtotalCents, proportion(lineSubtotalCents, input.discount!.percentOff, 100))
        : 0;
    return { key: line.key, lineSubtotalCents, discountCents, totalCents: lineSubtotalCents - discountCents };
  });

  const subtotalCents = lines.reduce((total, line) => total + line.lineSubtotalCents, 0);
  const discountCents = lines.reduce((total, line) => total + line.discountCents, 0);
  const merchandiseCents = subtotalCents - discountCents;

  let shippingCents = 0;
  if (input.shipping) {
    assertCents(input.shipping.priceCents, 'Shipping price');
    const free = input.shipping.freeOverCents !== null && merchandiseCents >= input.shipping.freeOverCents;
    shippingCents = free ? 0 : input.shipping.priceCents;
  }

  const taxLines = input.taxRates.map((rate) => {
    if (!Number.isInteger(rate.rateBps) || rate.rateBps < 0) throw new Error('Tax rate must be whole basis points.');
    const base = merchandiseCents + (rate.appliesToShipping ? shippingCents : 0);
    return { name: rate.name, rateBps: rate.rateBps, amountCents: proportion(base, rate.rateBps, 10_000) };
  });
  const taxCents = taxLines.reduce((total, line) => total + line.amountCents, 0);

  return {
    lines,
    subtotalCents,
    discountCents,
    discountApplied,
    shippingCents,
    taxLines,
    taxCents,
    totalCents: merchandiseCents + shippingCents + taxCents,
  };
}

/**
 * The most that can still be refunded on an order.
 */
export function refundableCents(totalCents: number, refundedCents: number): number {
  return Math.max(0, totalCents - refundedCents);
}
