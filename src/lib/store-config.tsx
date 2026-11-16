'use client';

/**
 * Server-resolved storefront configuration handed to client components:
 * how checkout hands off, and the owner's merchandising switches. Resolved in
 * the root layout from the environment and Admin → Settings; contains no secrets.
 */
import { createContext, useContext, type ReactNode } from 'react';

import type { CheckoutMode } from '@/domain/checkout';

export interface StoreConfig {
  readonly checkoutMode: CheckoutMode;
  /** Owner switch: "You may also like" inside the cart (default off, per the follow-up notes). */
  readonly cartUpsellEnabled: boolean;
  /** Where "Sign in" goes when native accounts are not configured. */
  readonly accountUrl: string;
  readonly nativeAccounts: boolean;
}

const DEFAULT_CONFIG: StoreConfig = {
  checkoutMode: 'disabled',
  cartUpsellEnabled: false,
  accountUrl: '/account',
  nativeAccounts: false,
};

const StoreConfigContext = createContext<StoreConfig>(DEFAULT_CONFIG);

export function StoreConfigProvider({ value, children }: { value: StoreConfig; children: ReactNode }) {
  return <StoreConfigContext.Provider value={value}>{children}</StoreConfigContext.Provider>;
}

export function useStoreConfig(): StoreConfig {
  return useContext(StoreConfigContext);
}
