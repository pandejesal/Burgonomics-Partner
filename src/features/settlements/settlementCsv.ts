import { partnerFunctionsApi } from '@/services/partnerFunctionsApi';

/**
 * CSV export for the settlement screen (owner decision 2026-11-20).
 *
 * The server builds the CSV (`settlementCsv()`), so the file a branch owner
 * saves is byte-for-byte the statement the server stored — the screen never
 * re-derives amounts. The only job here is fetching the attachment text and
 * handing it to the browser as a file.
 */

export interface SettlementCsvResult {
  filename: string;
  csv: string;
}

/** Server filename, or a deterministic fallback derived from the month. */
function resolveFilename(
  serverFilename: string | null | undefined,
  monthKey: string,
  branchId?: string,
): string {
  const clean = String(serverFilename ?? '').trim();
  if (clean) return clean.replace(/[/\\]/g, '-');
  const suffix = branchId ? `-${branchId}` : '';
  return `settlements-${monthKey}${suffix}.csv`;
}

/** Fetches the month's CSV text without touching the DOM (unit-testable). */
export async function fetchSettlementCsv(params: {
  monthKey: string;
  branchId?: string;
}): Promise<SettlementCsvResult> {
  const response = await partnerFunctionsApi.exportSettlementsCsv(params);
  const csv = String(response?.text ?? '');
  if (!csv.trim()) {
    // An empty attachment would save a 0-row file and look like "no sales".
    throw new Error('The server returned an empty settlement file — nothing was exported.');
  }
  return {
    filename: resolveFilename(response?.filename, params.monthKey, params.branchId),
    csv,
  };
}

/**
 * Downloads the CSV as a file. Fails loud (throws) when the export is refused,
 * so the screen can show the server's reason instead of a silent no-op.
 */
export async function downloadSettlementCsv(params: {
  monthKey: string;
  branchId?: string;
}): Promise<SettlementCsvResult> {
  const result = await fetchSettlementCsv(params);
  if (typeof document === 'undefined') return result;

  // UTF-8 BOM so Excel opens ₹ columns as UTF-8 rather than mojibake.
  const body = result.csv.startsWith('\uFEFF') ? result.csv : `\uFEFF${result.csv}`;
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', result.filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return result;
}
