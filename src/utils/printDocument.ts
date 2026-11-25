/**
 * Thermal slip printing — one honest path for every "print" control.
 *
 * Two defects made printing lie in two different ways:
 *
 * 1. `window.open('', '_blank', 'noopener')` ALWAYS returns `null` (the
 *    `noopener` feature deliberately severs the reference), so "Print Ticket"
 *    silently did nothing while the Settings test print — which opens a real
 *    window — worked. Staff verified the printer on the test slip and then
 *    printed nothing at the counter.
 * 2. `window.print()` on the app document prints the whole Partner shell first
 *    (sidebar, board, other customers' orders): a wasted ticket AND customer
 *    PII on paper. Tailwind `print:hidden` cannot hide siblings that carry no
 *    such class.
 *
 * So every print goes into ITS OWN document that contains the slip and nothing
 * else. The reference is severed manually (`win.opener = null`) instead of
 * through the `noopener` flag, because that flag is exactly what makes the
 * window unusable.
 */

/** Paper roll → printable character width (Font A). */
export const SLIP_COLUMNS = { '80mm': 48, '58mm': 32 } as const;

export type SlipPaperSize = keyof typeof SLIP_COLUMNS;

export interface SlipPrintRequest {
  /** Document title (browser tab / print job name). */
  title: string;
  /** Slip text exactly as it should reach the roll. Printed verbatim. */
  text: string;
  /** 48 = 80mm roll, 32 = 58mm roll. Anything else falls back to 48. */
  columns?: number;
  /** 1 or 2 physical copies (Kitchen, or Kitchen + Customer). */
  copies?: number;
}

export type SlipPrintFailureReason = 'popup-blocked' | 'write-failed';

export type SlipPrintOutcome =
  | { started: true }
  | { started: false; reason: SlipPrintFailureReason };

/** Escape slip text so a customer name/note can never become live HTML. */
export function escapeSlipHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function clampCopies(copies: number | undefined): number {
  if (!Number.isFinite(copies)) return 1;
  return Math.min(2, Math.max(1, Math.floor(copies as number)));
}

function resolvedColumns(columns: number | undefined): number {
  return columns === SLIP_COLUMNS['58mm'] ? SLIP_COLUMNS['58mm'] : SLIP_COLUMNS['80mm'];
}

/**
 * The complete print document. Contains ONLY the slip: no app shell, no board,
 * no other customer's data — and no HTML injection surface (the text is
 * escaped before it is written).
 */
export function buildSlipPrintHtml(request: SlipPrintRequest): string {
  const columns = resolvedColumns(request.columns);
  const copies = clampCopies(request.copies);
  const rollWidth = columns === SLIP_COLUMNS['58mm'] ? '58mm' : '80mm';
  const body = escapeSlipHtml(request.text);

  const slips: string[] = [];
  for (let copy = 0; copy < copies; copy += 1) {
    const last = copy === copies - 1;
    // One page break between copies; never a trailing blank page.
    slips.push(
      `<pre class="${last ? 'slip slip-last' : 'slip'}">${body}</pre>`
    );
  }

  return [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8">',
    `<title>${escapeSlipHtml(request.title)}</title>`,
    '<style>',
    `@page { size: ${rollWidth} auto; margin: 0; }`,
    'html, body { margin: 0; padding: 0; background: #fff; color: #000; }',
    '.slip { margin: 0; padding: 2mm 3mm; font-family: "Courier New", ui-monospace, monospace;',
    '        font-size: 12px; line-height: 1.35; white-space: pre-wrap; word-break: break-word;',
    '        page-break-after: always; break-after: page; }',
    '.slip-last { page-break-after: auto; break-after: auto; }',
    '</style></head><body>',
    slips.join('\n'),
    // Print as soon as the document exists. The fallback timer covers a
    // window whose load event already fired before the script was parsed.
    '<script>window.focus();',
    'window.print();',
    'setTimeout(function () { try { window.print(); } catch (e) {} }, 400);',
    '</script>',
    '</body></html>',
  ].join('\n');
}

/**
 * Open the slip document in its own window and start the OS print dialog.
 *
 * Returns an OUTCOME, never a silent no-op: a blocked popup is reported so the
 * caller can toast it. `open` is injectable for tests.
 */
export function printSlipDocument(
  request: SlipPrintRequest,
  open: typeof window.open | undefined = typeof window !== 'undefined'
    ? window.open.bind(window)
    : undefined
): SlipPrintOutcome {
  if (!open) return { started: false, reason: 'popup-blocked' };

  // NO `noopener` in the feature string: it makes the returned reference null,
  // which is precisely the bug this module exists to remove. The relationship
  // is severed manually on the next line instead.
  const win = open('', '_blank', 'width=380,height=640');
  if (!win) return { started: false, reason: 'popup-blocked' };

  try {
    win.opener = null;
  } catch {
    /* some embedded webviews expose opener as read-only — harmless */
  }

  try {
    win.document.write(buildSlipPrintHtml(request));
    win.document.close();
    return { started: true };
  } catch {
    try {
      win.close();
    } catch {
      /* already gone */
    }
    return { started: false, reason: 'write-failed' };
  }
}
