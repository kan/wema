import type { WemaNote } from '../types.js';

/**
 * The value to store for `WemaNote.meta`: a frozen copy holding the string
 * entries of `value`, or `undefined` when `value` is not a plain object.
 * The value may come from the network (`applyRemote`) or from a file
 * (`importData`), so anything that is not a string is dropped.
 * The copy is frozen because a note is copied by spreading it: every copy of
 * a note shares this one object.
 */
export function normalizeMeta(value: unknown): WemaNote['meta'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  // Object.fromEntries defines own properties, so a "__proto__" key stays data
  return Object.freeze(
    Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string')),
  ) as WemaNote['meta'];
}

/**
 * Whether two values of a note or edge field are the same. Fields hold
 * primitives, except `meta`, which is compared by its entries.
 */
export function sameFieldValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aKeys = Object.keys(a);
  return (
    aKeys.length === Object.keys(b).length &&
    aKeys.every((key) => Object.hasOwn(b, key) && (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key])
  );
}
