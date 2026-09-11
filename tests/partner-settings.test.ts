import { describe, it, expect } from 'vitest';
import {
  mergePartnerSettings,
  DEFAULT_PARTNER_SETTINGS,
  PARTNER_SETTINGS_DOC,
} from '../src/admin/pages/AdminSettingsPage';

describe('mergePartnerSettings (Loop 8/120)', () => {
  it('overlays saved values on defaults', () => {
    expect(
      mergePartnerSettings({ gstRate: 12, supportPhone: '+91 98765 43210', autoClose: false })
    ).toMatchObject({
      gstRate: 12,
      deliveryFee: DEFAULT_PARTNER_SETTINGS.deliveryFee,
      supportPhone: '+91 98765 43210',
      autoClose: false,
    });
  });

  it('falls back on garbage numbers and wrong types', () => {
    expect(
      mergePartnerSettings({ gstRate: NaN, deliveryFee: -5, minOrder: 'x' as any, autoClose: 'yes' as any })
    ).toMatchObject({
      gstRate: DEFAULT_PARTNER_SETTINGS.gstRate,
      deliveryFee: DEFAULT_PARTNER_SETTINGS.deliveryFee,
      minOrder: DEFAULT_PARTNER_SETTINGS.minOrder,
      autoClose: DEFAULT_PARTNER_SETTINGS.autoClose,
    });
  });

  it('pins the shared settings doc id', () => {
    expect(PARTNER_SETTINGS_DOC).toBe('partner_settings');
  });
});
