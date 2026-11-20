import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Admin → Stores "POS Webhook Toggles & Settings" honesty (partner-ops, fix wave
 * 2026-11-20).
 *
 * Four switches lived in that panel and every one of them was decorative:
 *
 *   Auto Accept Orders        — no ordering path reads `autoAcceptOrders`.
 *   Kitchen Display Link      — no KDS reader consults `kitchenDisplayEnabled`.
 *   Online Payments           — checkout decides payment methods; nothing reads
 *                               `onlinePaymentEnabled`.
 *   Cash on Delivery          — same for `cashOnDeliveryEnabled`.
 *
 * Their onChange did `saveStores(...)`, so the value really was persisted — and
 * that is the problem: an operator flips "Cash on Delivery" off, the row saves,
 * customers keep paying cash at the door. A switch that saves a flag nothing
 * consults is the same defect class as the removed auto-print KOT toggle.
 *
 * `handleUpdateStoreSettings` was worse: it is a form submit handler on a form
 * with NO submit control, so it could never run — dead code that still read as
 * a working "save settings" path.
 *
 * Contract pinned here (source contract, the repo precedent for render-level
 * honesty assertions is `CDN_PURGE_UNAVAILABLE_REASON`):
 *   - the four controls are rendered disabled with an explicit, exported reason;
 *   - no toggle claims a persist (no `saveStores` in those handlers) because a
 *     persist would re-create the fake-success path;
 *   - the dead submit handler is gone.
 */

const page = readFileSync(
  resolve(__dirname, '../src/admin/pages/AdminStoresPage.tsx'),
  'utf8',
);

describe('the POS/payment toggles state their real wiring', () => {
  it('exports one reason that says they are not wired, naming the POS', () => {
    // Read from source, not by importing the page: this file runs alongside the
    // whole unit set, and a dynamic import of the page (500+ modules) pushed
    // past the 30 s timeout under load. The regex pins BOTH the `export const`
    // declaration and its copy, which is what the switch rows read.
    const decl = page.match(
      /export const STORE_SETTINGS_NOT_WIRED_REASON =\s*\n?\s*"([^"]*)";/,
    );
    expect(decl).toBeTruthy();
    const reason = decl![1];
    expect(reason.toLowerCase()).toContain('not wired');
    expect(reason).toContain('Petpooja');
    // Honesty wording: never a success claim.
    expect(reason.toLowerCase()).not.toContain('success');
    expect(reason.toLowerCase()).not.toContain('updated');
  });

  it('renders all four controls disabled, each carrying the reason', () => {
    // One row per flag, all four in the same declarative list (so a fifth,
    // re-enabled switch cannot be slipped in beside them).
    for (const flag of [
      'autoAcceptOrders',
      'kitchenDisplayEnabled',
      'onlinePaymentEnabled',
      'cashOnDeliveryEnabled',
    ]) {
      expect(page).toContain(`key: "${flag}"`);
    }
    // The list renders ONE input per row and every input is disabled, carries
    // the shared reason and has no change handler.
    const listBlock = page.slice(page.indexOf('key: "autoAcceptOrders"'));
    const inputBlock = listBlock.slice(listBlock.indexOf('<input'), listBlock.indexOf('/>'));
    expect(inputBlock).toContain('disabled');
    expect(inputBlock).toContain('aria-disabled="true"');
    expect(inputBlock).toContain('title={STORE_SETTINGS_NOT_WIRED_REASON}');
    expect(inputBlock).not.toContain('onChange');
  });

  it('stops persisting a flag no path reads (no saveStores in the toggle rows)', () => {
    const panel = page.slice(
      page.indexOf('POS Webhook Toggles'),
      page.indexOf('POS Webhook Toggles') + 5000,
    );
    expect(panel).not.toContain('saveStores(updated)');
    expect(panel).not.toContain('onChange=');
  });

  it('removes the dead settings submit handler (form had no submit control)', () => {
    expect(page).not.toContain('handleUpdateStoreSettings');
    expect(page).not.toContain('Store configurations updated successfully');
  });
});
