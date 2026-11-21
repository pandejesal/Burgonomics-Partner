/**
 * Loyalty UI retirement (owner decision 2026-11-20: "Loyalty no: hide coins,
 * tiers and points everywhere").
 *
 * The Partner customer screens still rendered a "Grill Coins" column, an
 * "Adjust Coins" action, a circulating-balance KPI and a whole adjustment
 * modal. The server has just stopped minting them too, so leaving the UI would
 * dangle a control whose ledger can no longer grow.
 *
 * Rendered through react-dom/server (the repo's node test environment), the
 * assertions target the copy a cashier/customer actually sees — never the
 * component internals — so a later refactor cannot satisfy them by accident.
 *
 * RED against the pre-fix components.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { CustomerTable } from '../src/features/customers/components/CustomerTable';
import type { Customer } from '../src/types';

const customer = (over: Partial<Customer> = {}): Customer =>
  ({
    id: 'cust_1',
    name: 'Fixture Customer',
    phone: '9876543210',
    segment: 'VIP',
    totalOrders: 4,
    totalSpend: 1200,
    averageOrderValue: 300,
    loyaltyPoints: 320,
    ...over,
  }) as Customer;

const renderTable = () =>
  renderToStaticMarkup(
    React.createElement(MemoryRouter, null,
      React.createElement(CustomerTable, { customers: [customer()] })
    )
  );

const LOYALTY_WORDS = /loyalty|grill coins|grill-coins|coins|points|tier/i;

describe('Partner customer directory after the loyalty retirement', () => {
  it('renders no loyalty column, coin balance, tier or adjustment action', () => {
    const html = renderTable();
    // The customer row still renders (this is a retirement, not a deletion).
    expect(html).toContain('Fixture Customer');
    expect(html).toContain('9876543210');
    // But nothing loyalty-shaped survives.
    expect(html).not.toMatch(LOYALTY_WORDS);
    expect(html).not.toContain('320');
  });

  it('keeps the commercial columns a branch actually uses', () => {
    const html = renderTable();
    expect(html).toContain('Lifetime Spend');
    expect(html).toContain('Total Orders');
    expect(html).toContain('Avg Order Value');
    expect(html).toContain('1,200');
    expect(html).toContain('300');
  });

  it('does not attach an adjustment handler to any row', () => {
    // The modal seam is gone rather than hidden: a caller cannot open it.
    expect(renderTable()).not.toMatch(/aria-label="Adjust/i);
  });
});
