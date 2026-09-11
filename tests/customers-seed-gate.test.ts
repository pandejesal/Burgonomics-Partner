import { describe, it, expect } from 'vitest';
import { shouldSeedDirectory } from '../src/hooks/useCustomers';

describe('shouldSeedDirectory (Loop 39/120)', () => {
  it('seeds only an empty directory in dev builds', () => {
    expect(shouldSeedDirectory(0, true)).toBe(true);
  });

  it('never seeds prod, even when empty', () => {
    expect(shouldSeedDirectory(0, false)).toBe(false);
  });

  it('never seeds over live rows', () => {
    expect(shouldSeedDirectory(3, true)).toBe(false);
    expect(shouldSeedDirectory(3, false)).toBe(false);
  });
});
