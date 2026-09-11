import { describe, it, expect } from 'vitest';
import { actorLabelFor } from '../src/admin/pages/AdminCustomersPage';

describe('actorLabelFor (Loop 9/120)', () => {
  it('names the acting admin with role', () => {
    expect(actorLabelFor('Asha Manager', 'Store Manager')).toBe('Asha Manager (Store Manager)');
  });

  it('falls back to role, then Staff', () => {
    expect(actorLabelFor(undefined, 'Finance')).toBe('Finance');
    expect(actorLabelFor(undefined, '')).toBe('Staff');
  });

  it('never emits the retired hardcoded identity', () => {
    expect(actorLabelFor('Jesal Pande', 'Developer')).not.toContain('Super Admin');
  });
});
