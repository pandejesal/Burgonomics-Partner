/**
 * Firestore (`getFirestore`, no `ignoreUndefinedProperties`) throws
 * "Unsupported field value: undefined" for any undefined member — including
 * nested array/object members. Build optional fields conditionally, then
 * sanitise the whole payload before setDoc.
 *
 * Class instances (Firestore Timestamp, GeoPoint, …) are returned untouched;
 * only plain objects/arrays are walked.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry !== undefined)
      .map((entry) => stripUndefinedDeep(entry)) as unknown as T;
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry !== undefined) out[key] = stripUndefinedDeep(entry);
    }
    return out as T;
  }
  return value;
}
