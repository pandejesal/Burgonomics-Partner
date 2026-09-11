import { describe, it, expect } from 'vitest';
import {
  mergeLoyaltyConfig,
  DEFAULT_LOYALTY_CONFIG,
  LOYALTY_CONFIG_DOC,
} from '../src/admin/pages/AdminLoyaltyConfigPage';

describe('mergeLoyaltyConfig (Loop 21/120)', () => {
  it('overlays saved values on defaults', () => {
    const merged = mergeLoyaltyConfig({ walletPassName: 'Custom', pointsExpiryMonths: 6, pushEnabled: false });
    expect(merged.walletPassName).toBe('Custom');
    expect(merged.pointsExpiryMonths).toBe(6);
    expect(merged.pushEnabled).toBe(false);
    expect(merged.rules).toEqual(DEFAULT_LOYALTY_CONFIG.rules);
  });

  it('falls back on garbage', () => {
    const merged = mergeLoyaltyConfig({ pointsExpiryMonths: NaN, rules: 'x' as any, walletPassColor: 5 as any });
    expect(merged.pointsExpiryMonths).toBe(DEFAULT_LOYALTY_CONFIG.pointsExpiryMonths);
    expect(merged.rules).toEqual(DEFAULT_LOYALTY_CONFIG.rules);
    expect(merged.walletPassColor).toBe(DEFAULT_LOYALTY_CONFIG.walletPassColor);
  });

  it('pins the shared config doc id', () => {
    expect(LOYALTY_CONFIG_DOC).toBe('loyalty_config');
  });
});
