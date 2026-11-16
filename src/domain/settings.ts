/**
 * Store settings editable in Admin → Settings. Public business details default
 * to what the merchant already publishes on infinityclo.ca (contact policy and
 * Instagram bio); nothing here is invented.
 */
import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);

export const storeSettingsSchema = z.object({
  brandName: text(40).min(1),
  tradeName: text(80).min(1),
  publicEmail: z.string().trim().email().or(z.literal('')),
  publicPhone: text(40),
  /** Where contact-form notifications go (staff inbox). Not shown publicly. */
  notificationEmail: z.string().trim().email().or(z.literal('')),
  instagramHandle: text(40),
  facebookUrl: z.string().trim().url().or(z.literal('')),
  threadsHandle: text(40),
  /** Owner switch. The follow-up notes ask "cart: no upsells?" — off until the owner decides. */
  cartUpsellEnabled: z.boolean(),
  pdpRecommendationsEnabled: z.boolean(),
  newsletterDoubleOptIn: z.boolean(),
  lowStockThreshold: z.number().int().min(0).max(1000),
});
export type StoreSettings = z.infer<typeof storeSettingsSchema>;

export const DEFAULT_SETTINGS: StoreSettings = {
  brandName: 'INFNITY',
  tradeName: 'Infnity.clo',
  publicEmail: 'apparelinifinty85@gmail.com',
  publicPhone: '+1 (431) 388-3322',
  notificationEmail: '',
  instagramHandle: 'infnity.clo',
  facebookUrl: 'https://www.facebook.com/Infinityapparelclo',
  threadsHandle: 'infnity.clo',
  cartUpsellEnabled: false,
  pdpRecommendationsEnabled: true,
  newsletterDoubleOptIn: true,
  lowStockThreshold: 5,
};
