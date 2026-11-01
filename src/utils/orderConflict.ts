/**
 * A stale/precondition rejection (HTTP 409, or a server body saying
 * conflict/stale) means ANOTHER terminal already moved the record. Reporting
 * "unchanged" in that case is false — the caller must say so and refresh.
 *
 * The API client surfaces only the message, so detect both an attached status
 * and the common message/body shapes.
 */
export function isStaleOrderConflict(err: unknown): boolean {
  const e = err as
    | { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown }
    | null
    | undefined;
  if (e?.status === 409 || e?.status === '409' || e?.statusCode === 409) return true;
  const code = typeof e?.code === 'string' ? e.code.toLowerCase() : '';
  if (code === 'conflict' || code === 'stale' || code === 'precondition_failed') return true;
  return /\b409\b|conflict|stale|precondition|already (?:moved|updated|changed)/i.test(
    String(e?.message ?? ''),
  );
}
