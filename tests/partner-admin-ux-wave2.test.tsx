/**
 * Partner admin UX wave 2 — audit polish-2026-10-14 / sprint-2026-10-16.
 *
 *   M10  the shared confirmation settles its async action before closing and
 *        surfaces a failure instead of reporting success
 *   M11  the shared confirmation is an accessible dialog (role + name + close)
 *   M12  table sorting/row activation are keyboard operable (button + aria-sort)
 *   M13  table controls carry accessible names
 *   M14  the table clamps its page when the data shrinks
 *
 * Node-env, no DOM (repo convention): markup semantics are asserted through
 * react-dom/server static renders; the state-lifecycle rules a static render
 * cannot drive (async settle order, page clamp) are pinned at the source level.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

import { ConfirmDialog, runConfirmAction } from '../src/admin/components/Utilities';
import { ResponsiveTable, type TableColumn } from '../src/admin/components/TableSystem';

const utilitiesSrc = readFileSync(
  fileURLToPath(new URL('../src/admin/components/Utilities.tsx', import.meta.url)),
  'utf8',
);
const tableSrc = readFileSync(
  fileURLToPath(new URL('../src/admin/components/TableSystem.tsx', import.meta.url)),
  'utf8',
);

/* ------------------------------- M10 ---------------------------------- */

describe('M10 — confirmation settles the async action before closing', () => {
  it('awaits the action; does not close on failure; returns the error message', async () => {
    const onClose = vi.fn();
    const message = await runConfirmAction(() => Promise.reject(new Error('gateway offline')), onClose);

    expect(onClose).not.toHaveBeenCalled();
    expect(message).toBe('gateway offline');
  });

  it('closes exactly once, and only after a successful action resolves', async () => {
    const order: string[] = [];
    const onClose = vi.fn(() => order.push('close'));

    const message = await runConfirmAction(async () => {
      order.push('action');
    }, onClose);

    expect(order).toEqual(['action', 'close']);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(message).toBeNull();
  });

  it('treats a void action as success and closes', async () => {
    const onClose = vi.fn();
    expect(await runConfirmAction(() => {}, onClose)).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('surfaces the failure visibly and blocks re-entry while pending', () => {
    expect(utilitiesSrc).toContain('onConfirm: () => void | Promise<void>');
    expect(utilitiesSrc).toContain('role="alert"');
    expect(utilitiesSrc).toMatch(/disabled=\{isPending\}/);
  });
});

/* ------------------------------- M11 ---------------------------------- */

describe('M11 — the confirmation is an accessible modal', () => {
  const html = renderToStaticMarkup(
    <ConfirmDialog
      isOpen
      onClose={() => {}}
      onConfirm={() => {}}
      title="Flush gateway cache?"
      description="Purges cached catalog structures."
    />,
  );

  it('exposes a named dialog whose title is associated', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Flush gateway cache?');

    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy, 'aria-labelledby must be present').toBeTruthy();
    expect(html).toContain(`id="${labelledBy}"`);
  });

  it('names the close control', () => {
    expect(html).toContain('aria-label="Close confirmation"');
  });
});

/* --------------------------- M12 + M13 -------------------------------- */

type Row = { id: number; name: string; amount: number };

const columns: TableColumn<Row>[] = [
  { header: 'Name', accessorKey: 'name' },
  { header: 'Amount', accessorKey: 'amount', sortable: true },
];

const tableHtml = renderToStaticMarkup(
  <ResponsiveTable
    data={[
      { id: 1, name: 'Alpha', amount: 30 },
      { id: 2, name: 'Beta', amount: 10 },
    ]}
    columns={columns}
    bulkActions={[{ label: 'Archive', onClick: () => {} }]}
    onRowClick={() => {}}
  />,
);

describe('M12 — sorting and row activation are keyboard operable', () => {
  it('the sortable header holds a native button and the th carries aria-sort', () => {
    expect(tableHtml).toContain('aria-sort="none"');
    expect(tableHtml).toMatch(/<th[^>]*aria-sort="none"[^>]*>\s*<button/);
  });

  it('rows expose a focusable detail control instead of relying on row click', () => {
    expect(tableHtml).toMatch(/<button[^>]*aria-label="View details for record 1"/);
    expect(tableHtml).toMatch(/<button[^>]*aria-label="View details for record 2"/);
  });
});

describe('M13 — table controls have accessible names', () => {
  it('names select-all, per-row select and pagination', () => {
    expect(tableHtml).toContain('aria-label="Select all rows on this page"');
    expect(tableHtml).toContain('aria-label="Select record 1"');
    expect(tableHtml).toContain('aria-label="Previous page"');
    expect(tableHtml).toContain('aria-label="Next page"');
  });

  it('gives the search input a persistent (non-placeholder) name', () => {
    expect(tableHtml).toMatch(/<input[^>]*type="text"[^>]*aria-label=/);
  });

  it('names the clear-search and clear-selection controls', () => {
    expect(tableSrc).toContain('aria-label="Clear search"');
    expect(tableSrc).toContain('aria-label="Clear selection"');
  });
});

/* ------------------------------- M14 ---------------------------------- */

describe('M14 — the page clamps when the data shrinks', () => {
  it('clamps currentPage when totalPages changes', () => {
    expect(tableSrc).toMatch(
      /useEffect\(\(\)\s*=>\s*\{\s*setCurrentPage\(\(p\)\s*=>\s*Math\.min\(p,\s*totalPages\)\)/,
    );
    expect(tableSrc).toContain('[totalPages]');
  });

  it('disables Next beyond the last page (not only on exact equality)', () => {
    expect(tableSrc).toContain('disabled={currentPage >= totalPages}');
  });
});
