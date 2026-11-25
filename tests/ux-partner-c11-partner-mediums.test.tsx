import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

/**
 * UX audit 2026-11-26, Partner Mediums that are visible in the demo:
 *
 * #16 — the Orders filter chips were `px-3 py-1.5 text-xs` with no `min-h`, so
 *       they measured ~28px tall while the KDS had already fixed the same
 *       control to `min-h-11`. On a demo phone they are hard to hit.
 * #17 — the Orders table painted all 100 rows (two sticky columns inside one
 *       horizontal scroller), which tears on an Android tablet drag. The fix
 *       renders a page of rows with an explicit "show more", and keeps only one
 *       sticky column below `lg`.
 * #19 — the Settings "Preview Volume" slider fed only its own label.
 * #20 — the app Toaster sat `top-right` with no safe-area offset, landing under
 *       the Android status bar.
 */

const orderFiltersSrc = readFileSync(
  new URL('../src/features/orders/components/OrderFiltersBar.tsx', import.meta.url),
  'utf8',
);
const tableSrc = readFileSync(
  new URL('../src/features/orders/components/OrderTableList.tsx', import.meta.url),
  'utf8',
);
const appSrc = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const testerSrc = readFileSync(
  new URL('../src/features/settings/components/AudioNotificationTester.tsx', import.meta.url),
  'utf8',
);

describe('UX #16 — order filter chips are finger-sized', () => {
  it('gives every channel/status/payment chip a 44px minimum hit height', () => {
    // Four literal channel chips plus the payment (4) and status (7) chip maps
    // — 15 buttons render from 7 declarations. On the audited commit this file
    // contained ZERO `min-h-11`, so this is the RED/GREEN oracle for the set.
    expect((orderFiltersSrc.match(/min-h-11/g) ?? []).length).toBeGreaterThanOrEqual(6);
    // And no chip declaration was left behind without it.
    const chipDeclarations = orderFiltersSrc
      .split('\n')
      .filter((line) => line.includes('cursor-pointer shrink-0') && line.includes('rounded-lg'));
    expect(chipDeclarations.length).toBe(6);
    for (const line of chipDeclarations) expect(line).toContain('min-h-11');
  });

  it('keeps the chips on a single scrolling row instead of absorbing drags', () => {
    // All three chip rows (channel, payment, status) contain their own drag.
    expect((orderFiltersSrc.match(/overscroll-x-contain/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('UX #17 — the Orders table paints a page, not the whole feed', () => {
  it('pages the rows with an explicit control instead of rendering every order', () => {
    expect(tableSrc).toContain('ORDER_TABLE_PAGE_SIZE');
    expect(tableSrc).toMatch(/slice\(0, visibleCount\)/);
    expect(tableSrc).toMatch(/Show more/i);
  });

  it('keeps only ONE sticky column below lg on the row actions', () => {
    const lastCell = tableSrc.match(
      /<td className="([^"]*text-right[^"]*)">/,
    )?.[1];
    expect(lastCell).toBeDefined();
    // Pinned from `lg` up (where the wide table makes it useful), not on a
    // tablet where the two pinned columns tear during a diagonal drag.
    expect(lastCell).toContain('lg:sticky');
    expect(lastCell).not.toMatch(/(?<!lg:)sticky/);
  });

  it('still renders every row when the feed is small enough for one page', async () => {
    const { OrderTableList } = await import('../src/features/orders/components/OrderTableList');
    const orders = Array.from({ length: 3 }, (_, i) => ({
      id: `ord_${i}`,
      customerName: 'Fixture',
      customerPhone: '+910000000000',
      orderType: 'delivery',
      status: 'preparing',
      paymentStatus: 'paid',
      paymentMethod: 'online',
      createdAt: new Date('2026-11-03T21:30:00+05:30'),
      items: [{ name: 'Jr. Hero Burger', quantity: 1, price: 129 }],
      total: 129,
    })) as any[];
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <OrderTableList orders={orders} />
      </MemoryRouter>,
    );
    expect((html.match(/<tr/g) ?? []).length).toBe(4); // header + 3 body rows
    expect(html).not.toContain('Show more');
  });
});

describe('UX #19 — the Preview Volume slider is real (preview only)', () => {
  it('passes the slider value as the chime gain multiplier', () => {
    expect(testerSrc).toMatch(/playKDSChime\(\s*volume\s*\/\s*100\s*\)/);
  });

  it('still states that the alarm loudness is not what this slider controls', () => {
    // The pinned honesty assertion in coder-wave2-audio-tester-honesty.test.tsx
    // must keep passing: preview gain only, never a claim over the alarm.
    expect(testerSrc).toContain('does not change the alarm volume');
  });
});

describe('UX #20 — the toast stack clears the Android status bar', () => {
  it('renders at bottom-centre with a safe-area offset', () => {
    expect(appSrc).toContain('position="bottom-center"');
    expect(appSrc).toContain('safe-area-inset-bottom');
    expect(appSrc).not.toContain('position="top-right"');
  });
});

// Touch the vi import so a future edit cannot silently drop the mock seam.
void vi;
