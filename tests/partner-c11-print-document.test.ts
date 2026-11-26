import { describe, expect, it, vi } from 'vitest';
import {
  SLIP_COLUMNS,
  buildSlipPrintHtml,
  escapeSlipHtml,
  printSlipDocument,
} from '../src/utils/printDocument';

/**
 * F6 / A7 #1 + #4 + #7 — printing really prints, and only the slip.
 *
 * The Control Room's "Print Ticket" called
 * `window.open('', '_blank', 'noopener')` and checked the returned window.
 * `noopener` deliberately severs the reference, so `window.open` returns `null`
 * EVERY time: the button printed nothing while the Settings test print (a real
 * window) worked, so staff "verified the printer" and then printed nothing at
 * the counter. Printing now goes through one helper that opens a real window
 * (severing `opener` manually), writes a document containing ONLY the slip, and
 * reports a blocked popup instead of silently doing nothing.
 */

function fakeWindow(overrides: Record<string, unknown> = {}) {
  const win: any = {
    opener: 'parent',
    close: vi.fn(),
    document: {
      write: vi.fn(),
      close: vi.fn(),
    },
    ...overrides,
  };
  return win;
}

describe('A7 #1 — a blocked popup is reported, never a silent no-op', () => {
  it('does NOT pass noopener (that is what made window.open return null)', () => {
    const open = vi.fn(() => fakeWindow());
    const outcome = printSlipDocument({ title: 'KOT', text: 'HELLO' }, open as any);

    expect(outcome).toEqual({ started: true });
    expect(open).toHaveBeenCalledTimes(1);
    const features = String(open.mock.calls[0][2] ?? '');
    expect(features).not.toMatch(/noopener/i);
    // The reference is severed by hand instead, so the window is still usable.
    expect(open.mock.calls[0][1]).toBe('_blank');
  });

  it('reports popup-blocked when the window cannot be opened', () => {
    const open = vi.fn(() => null);
    expect(printSlipDocument({ title: 'KOT', text: 'HELLO' }, open as any)).toEqual({
      started: false,
      reason: 'popup-blocked',
    });
  });

  it('reports write-failed and closes the window when the document write throws', () => {
    const win = fakeWindow();
    win.document.write = vi.fn(() => {
      throw new Error('write denied');
    });
    const outcome = printSlipDocument(
      { title: 'KOT', text: 'HELLO' },
      vi.fn(() => win) as any,
    );

    expect(outcome).toEqual({ started: false, reason: 'write-failed' });
    expect(win.close).toHaveBeenCalled();
  });

  it('severs opener manually and writes then closes the document', () => {
    const win = fakeWindow();
    const outcome = printSlipDocument({ title: 'KOT', text: 'HELLO' }, vi.fn(() => win) as any);

    expect(outcome.started).toBe(true);
    expect(win.opener).toBeNull();
    expect(win.document.write).toHaveBeenCalledTimes(1);
    expect(win.document.close).toHaveBeenCalledTimes(1);
  });
});

describe('A7 #4 — the print document contains the slip and nothing else', () => {
  const html = buildSlipPrintHtml({ title: 'Burgonomics KOT #A1', text: 'KITCHEN ORDER TICKET' });

  it('is a self-contained document with no app shell and no board data', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('KITCHEN ORDER TICKET');
    // Nothing from the Partner UI may reach the roll.
    for (const forbidden of ['sidebar', 'AppLayout', 'admin-orders', 'nav']) {
      expect(html.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('sizes the page to the configured roll, not the app default', () => {
    expect(buildSlipPrintHtml({ title: 't', text: 'x', columns: SLIP_COLUMNS['58mm'] })).toContain(
      '@page { size: 58mm auto; margin: 0; }',
    );
    expect(buildSlipPrintHtml({ title: 't', text: 'x', columns: SLIP_COLUMNS['80mm'] })).toContain(
      '@page { size: 80mm auto; margin: 0; }',
    );
  });

  it('prints the configured number of copies (Kitchen, or Kitchen + Customer)', () => {
    const one = buildSlipPrintHtml({ title: 't', text: 'x', copies: 1 });
    const two = buildSlipPrintHtml({ title: 't', text: 'x', copies: 2 });

    expect(one.match(/<pre class="slip/g)).toHaveLength(1);
    expect(two.match(/<pre class="slip/g)).toHaveLength(2);
    // No trailing blank page: the LAST copy lifts the page break.
    expect(two).toContain('slip-last');
    expect(one).toContain('slip-last');
  });

  it('escapes slip text so an order name or note cannot become live HTML', () => {
    const html = buildSlipPrintHtml({
      title: '<script>alert(1)</script>',
      text: '<img src=x onerror=alert(2)> & 2 > 1',
    });

    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt; &amp; 2 &gt; 1');
    expect(escapeSlipHtml('a<b>c')).toBe('a&lt;b&gt;c');
  });

  it('starts the print dialog from inside the document (no window.print() on the app)', () => {
    expect(buildSlipPrintHtml({ title: 't', text: 'x' })).toContain('window.print()');
  });

  /**
   * r2 finding 2 (MEDIUM): the document called `window.print()` immediately AND
   * again 400 ms later "as a fallback". On a real printer that is two jobs for
   * one ticket — a duplicated KOT, or a duplicated customer invoice. The
   * fallback existed because a window whose `load` event had already fired would
   * never print; the fix is ONE guarded request, not a second unconditional one.
   */
  it('requests the print job EXACTLY once, never a timed second time', () => {
    const html = buildSlipPrintHtml({ title: 't', text: 'x' });
    const printCalls = html.match(/window\.print\(\)/g) ?? [];
    expect(printCalls).toHaveLength(1);
    // The unconditional +400 ms retry is the defect itself.
    expect(html).not.toMatch(/setTimeout\([^)]*window\.print/);
    // A guard must make a second invocation (load + readyState both firing) a
    // no-op rather than a second job.
    expect(html).toMatch(/Printed\s*=\s*true/);
  });
});

describe('A7 #7 — the helper honours the stored paper configuration', () => {
  it('maps an unknown width to the 80mm default instead of guessing 58mm', () => {
    expect(SLIP_COLUMNS['80mm']).toBe(48);
    expect(SLIP_COLUMNS['58mm']).toBe(32);
    expect(buildSlipPrintHtml({ title: 't', text: 'x', columns: 12 })).toContain('80mm auto');
  });

  it('clamps a non-finite copy count to one printed page', () => {
    const html = buildSlipPrintHtml({ title: 't', text: 'x', copies: Number.NaN });
    expect(html.match(/<pre class="slip/g)).toHaveLength(1);
  });
});
