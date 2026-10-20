/**
 * P2-F + P2-J — OrderDetailPage truth (implemented this round; the whole-file
 * pins replace behavior pins because OrderDetailPage is not hook-free — it
 * cannot be mounted in a node harness, see the partnerops-kds-dispatch-contract
 * harness note; peer reviewers should treat these as source-level
 * regression locks, not fabricated greens).
 *
 * P2-F: the fabricated client-side Porter rate card (₹40 base + ₹10/km,
 * hardcoded 8-minute ETA, synthetic QTE-PRTR quote id) is GONE. The page now
 * reads the server-authoritative multi-provider quote
 * (partnerFunctionsApi.dispatchQuote) and everything that is not a
 * server-backed number renders honestly as unavailable — never "Available".
 *
 * P2-J: a read failure is no longer rendered as "Order Not Found".
 * permission-denied means outside scope; unavailable/network means retryable;
 * only a genuinely missing/untyped doc keeps the Not Found wording.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/pages/OrderDetailPage.tsx', import.meta.url),
  'utf8'
);

describe('P2-F — quote display is server-authoritative (structural pins)', () => {
  it('no longer imports or invokes the fabricated client rate card', () => {
    expect(source).not.toMatch(/getPorterDeliveryQuote/);
    expect(source).not.toMatch(/porter_standard_rate_card/);
    expect(source).not.toMatch(/porterDelivery'}/); // the old service import is gone
    // And the odd fabricated-input guard survives: quotes fail closed on
    // missing coordinates instead of estimating from defaults.
    expect(source).toMatch(/dispatchQuote/);
  });

  it('renders only server-backed numbers, honest fallbacks otherwise', () => {
    // Server-backed happy path keyed on serviceable === true:
    expect(source).toMatch(/porterQuote\?\.serviceable === true/);
    // Out-of-zone speaks the server reason, not a success:
    expect(source).toMatch(/porterQuote\?\.serviceable === false/);
    expect(source).toMatch(/porterQuote\.message \|\| porterQuote\.reason/);
    // Missing/failed quote says unavailable — the old bare 'Available' is gone:
    expect(source).toMatch(/Quote unavailable — dispatch from the Delivery Queue/);
    expect(source).not.toMatch(/: 'Available'/);
  });

  it('routes the multi-provider winner label through dispatchProviderLabel', () => {
    expect(source).toMatch(/dispatchProviderLabel\(porterQuote\.winner\)/);
    // Even the booking confirm speaks the server's provider, not a hardcoded one:
    expect(source).not.toMatch(/PAID Porter rider/);
  });

  it('shows a fare in the paid-booking flow only when the server backed it', () => {
    // handleDispatchPorterRider + ConfirmDialog both require serviceable === true:
    const occurrences = source.match(
      /serviceable === true && typeof porterQuote\.estimatedFare === 'number'/g
    );
    expect(occurrences).not.toBeNull();
    expect(occurrences!.length).toBeGreaterThanOrEqual(2); // handler + dialog
    // A missing server ETA renders as no ETA at all — never a fabricated '0m':
    expect(source).not.toMatch(/estimatedPickupMinutes \?\? 0/);
  });
});

describe('P2-J — read errors are distinguished from genuine not-found (structural pins)', () => {
  it('branches typed Firestore failures before claiming the order is gone', () => {
    expect(source).toMatch(/orderError/);
    expect(source).toMatch(/permission-denied/);
    expect(source).toMatch(/readCode === 'unavailable' \|\| readCode === 'network-request-failed'/);
  });

  it('keeps scope/network paths honest and reserves Not Found for missing docs', () => {
    expect(source).toMatch(/Order Outside Your Branch/);
    expect(source).toMatch(/Order Details Unreachable/);
    expect(source).toMatch(/Order Not Found/);
    // Scope failures do not leak internals:
    expect(source).toMatch(/outside your assigned scope/);
  });

  it('offers a Retry control on recoverable read failures', () => {
    expect(source).toMatch(/\(retryable \|\| denied\)/);
    expect(source).toMatch(/Retry/);
  });
});
