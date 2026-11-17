/**
 * Turns flat form fields with dotted paths ("slides.0.images.1.url") into a
 * nested object. Checkbox fields are only present when ticked, so callers pass
 * the list of boolean paths they expect.
 */
export function parseNested(
  form: FormData,
  booleanPaths: readonly string[] = [],
): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const set = (path: string, value: unknown) => {
    const keys = path.split('.');
    let node: Record<string, unknown> | unknown[] = root;
    keys.forEach((key, index) => {
      const isLast = index === keys.length - 1;
      const nextIsIndex = /^\d+$/.test(keys[index + 1] ?? '');
      const container = node as Record<string, unknown>;
      if (isLast) {
        container[key] = value;
      } else {
        container[key] ??= nextIsIndex ? [] : {};
        node = container[key] as Record<string, unknown>;
      }
    });
  };
  for (const [key, value] of form.entries()) {
    if (key.startsWith('$') || typeof value !== 'string') continue;
    set(key, value);
  }
  for (const path of booleanPaths) {
    const value = form.get(path);
    set(path, value === 'on' || value === 'true');
  }
  return root;
}

/** Removes array holes left by skipped indices and entries flagged as removed. */
export function compact<T>(items: unknown): T[] {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (item) =>
      item !== undefined &&
      item !== null &&
      !(typeof item === 'object' && (item as { _remove?: unknown })._remove === 'on'),
  ) as T[];
}

export function numberOr(value: unknown, fallback: number): number {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function splitList(value: unknown): string[] {
  return typeof value === 'string'
    ? value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}
