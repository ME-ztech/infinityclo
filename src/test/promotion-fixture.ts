import { bundleConfigSchema } from '@/domain/promotions';

/** A complete, approvable bundle used by tests. */
export const approvePromotionFixture = bundleConfigSchema.parse({
  kind: 'bundle',
  title: 'Any 2 pieces',
  method: 'automatic',
  minimumQuantity: 2,
  value: { type: 'percentage', percent: 15 },
});
