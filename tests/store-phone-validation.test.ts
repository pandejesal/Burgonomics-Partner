import { describe, it, expect } from 'vitest';
import { normalizeIndianMobile } from '../src/admin/pages/AdminStoresPage';

describe('normalizeIndianMobile (Loop 6/120)', () => {
  it('accepts plain 10-digit Indian mobiles', () => {
    expect(normalizeIndianMobile('9876543210')).toBe('+91 98765 43210');
  });

  it('accepts +91 and leading-zero forms', () => {
    expect(normalizeIndianMobile('+91 98765 43210')).toBe('+91 98765 43210');
    expect(normalizeIndianMobile('09876543210')).toBe('+91 98765 43210');
  });

  it('rejects placeholders and invalid numbers', () => {
    expect(normalizeIndianMobile('+91 98765 00000')).toBeNull();
    expect(normalizeIndianMobile('0000000000')).toBeNull();
    expect(normalizeIndianMobile('12345')).toBeNull();
    expect(normalizeIndianMobile('')).toBeNull();
  });
});
