import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * The staff prompt for an ambiguous KOT (P1-K).
 *
 * Real refusals it must survive (backend orderPush.ts:1243-1470):
 *  - "Order X carries a POS order id (...) — the ticket is already registered;
 *    confirm it as printed instead of retrying"
 *  - "Order X was already resolved as "printed" — it cannot now be resolved as
 *    "retry""
 *  - "Order X is not parked for reconciliation — nothing to resolve"
 */
const { resolve } = vi.hoisted(() => ({ resolve: vi.fn() }));

vi.mock('@/services/partnerFunctionsApi', async () => {
  const actual = await vi.importActual<typeof import('../src/services/partnerFunctionsApi')>(
    '../src/services/partnerFunctionsApi'
  );
  return { ...actual };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { PetpoojaKotResolver } from '../src/features/orders/components/PetpoojaKotResolver';

function markup(props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <PetpoojaKotResolver
      orderId="ord_kot_1"
      role="branch_staff"
      onResolve={resolve}
      {...props}
    />
  );
}

describe('PetpoojaKotResolver', () => {
  it('asks the one question and offers both truths', () => {
    const html = markup();

    expect(html).toContain('Did the kitchen receive this order?');
    expect(html).toContain('Yes, it printed');
    expect(html).toContain('No, send again');
    // The confirmation is a separate step; it must not be pre-rendered open.
    expect(html).not.toContain('cooks this order twice');
  });

  it('never dials the API on render', () => {
    markup();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('gives both actions a 44px minimum target', () => {
    const html = markup();
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBe(2);
    for (const button of buttons) expect(button).toContain('min-h-11');
  });

  it('tells a refused role who can confirm the print, and offers no actions', () => {
    for (const role of ['support', 'regional_manager', 'customer', undefined]) {
      const html = markup({ role });
      expect(html).not.toContain('Yes, it printed');
      expect(html).not.toContain('No, send again');
      expect(html).toContain('branch owner');
      // The state itself is still visible — silence would hide a real problem.
      expect(html).toContain('POS unconfirmed');
    }
  });

  it('renders the dark KDS/app shell for theme="app"', () => {
    const html = markup({ theme: 'app' });
    expect(html).toContain('bg-amber-950/40');
  });
});
