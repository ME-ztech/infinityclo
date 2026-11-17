import { FIELD, LABEL } from '@/components/account/AccountShell';
import type { CustomerAddress } from '@/server/customer/gateway';

/**
 * Countries offered in the address form. Canada and the United States lead
 * because that is where the store's customers are; the rest of the list covers
 * the store's other shipping destinations in alphabetical order. Shopify
 * validates the final address, so an unsupported destination is rejected there
 * with its own message.
 */
const COUNTRIES: ReadonlyArray<readonly [string, string]> = [
  ['CA', 'Canada'],
  ['US', 'United States'],
  ['AU', 'Australia'],
  ['FR', 'France'],
  ['DE', 'Germany'],
  ['IE', 'Ireland'],
  ['IT', 'Italy'],
  ['JM', 'Jamaica'],
  ['JP', 'Japan'],
  ['MX', 'Mexico'],
  ['NL', 'Netherlands'],
  ['NZ', 'New Zealand'],
  ['NG', 'Nigeria'],
  ['PH', 'Philippines'],
  ['ES', 'Spain'],
  ['GB', 'United Kingdom'],
];

function Field({
  id,
  name,
  label,
  defaultValue,
  required,
  autoComplete,
  hint,
  maxLength,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string | null;
  required?: boolean;
  autoComplete?: string;
  hint?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
        {!required && <span className="normal-case tracking-normal"> (optional)</span>}
      </label>
      <input
        id={id}
        name={name}
        defaultValue={defaultValue ?? ''}
        required={required}
        autoComplete={autoComplete}
        maxLength={maxLength}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={FIELD}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-fg-muted mt-1 text-xs">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Address inputs, shared by the "add" and "edit" forms. `prefix` keeps ids unique per form. */
export function AddressFields({ prefix, address }: { prefix: string; address?: CustomerAddress }) {
  const country = address?.territoryCode ?? 'CA';
  const known = COUNTRIES.some(([code]) => code === country);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field id={`${prefix}-first`} name="firstName" label="First name" defaultValue={address?.firstName} required autoComplete="given-name" maxLength={60} />
      <Field id={`${prefix}-last`} name="lastName" label="Last name" defaultValue={address?.lastName} required autoComplete="family-name" maxLength={60} />
      <div className="md:col-span-2">
        <Field id={`${prefix}-address1`} name="address1" label="Street address" defaultValue={address?.address1} required autoComplete="address-line1" maxLength={120} />
      </div>
      <div className="md:col-span-2">
        <Field id={`${prefix}-address2`} name="address2" label="Apartment, suite, unit" defaultValue={address?.address2} autoComplete="address-line2" maxLength={120} />
      </div>
      <Field id={`${prefix}-city`} name="city" label="City" defaultValue={address?.city} required autoComplete="address-level2" maxLength={80} />
      <Field id={`${prefix}-zone`} name="zoneCode" label="Province / state code" defaultValue={address?.zoneCode} autoComplete="address-level1" hint="Two letters, for example MB or NY." maxLength={6} />
      <Field id={`${prefix}-zip`} name="zip" label="Postal / ZIP code" defaultValue={address?.zip} required autoComplete="postal-code" maxLength={16} />
      <div>
        <label htmlFor={`${prefix}-country`} className={LABEL}>
          Country
        </label>
        <select id={`${prefix}-country`} name="territoryCode" defaultValue={country} required autoComplete="country" className={FIELD}>
          {!known && <option value={country}>{country}</option>}
          {COUNTRIES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <Field id={`${prefix}-phone`} name="phoneNumber" label="Phone" defaultValue={address?.phoneNumber} autoComplete="tel" hint="International format, for example +12045550123." maxLength={24} />
      <Field id={`${prefix}-company`} name="company" label="Company" defaultValue={address?.company} autoComplete="organization" maxLength={80} />
    </div>
  );
}
