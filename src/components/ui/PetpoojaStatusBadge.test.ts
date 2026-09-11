import { describe, it, expect } from 'vitest';
import { petpoojaBadgeMeta } from './PetpoojaStatusBadge';

// Loop 58/120: the header badge mounted as 'Live' with a 'Just now'
// timestamp it never measured. It must mount 'unknown' (no measured state
// may render as verified), and each real state must map honestly.
describe('Loop 58: Petpooja badge honesty', () => {
  it('maps unknown to an honest Unknown label, never Live', () => {
    const meta = petpoojaBadgeMeta('unknown');
    expect(meta.label).toBe('Unknown');
    expect(meta.label).not.toBe('Live');
    expect(meta.dot).toContain('zinc');
  });

  it('maps online to Live with an emerald signal', () => {
    const meta = petpoojaBadgeMeta('online');
    expect(meta.label).toBe('Live');
    expect(meta.dot).toContain('emerald');
  });

  it('maps syncing and error distinctly from verified-live', () => {
    expect(petpoojaBadgeMeta('syncing').label).toBe('Syncing');
    expect(petpoojaBadgeMeta('syncing').label).not.toBe('Live');
    expect(petpoojaBadgeMeta('error').label).toBe('Fallback');
    expect(petpoojaBadgeMeta('error').dot).toContain('rose');
  });
});
