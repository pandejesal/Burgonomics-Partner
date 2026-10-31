import { describe, it, expect } from 'vitest';
import { titleForPath } from './routeTitle';

/**
 * A11Y-L5: every route shipped the same static <title>. App.tsx is the one
 * central router, so the document title is derived there from the pathname.
 */
describe('titleForPath', () => {
  it('titles the login route', () => {
    expect(titleForPath('/login')).toBe('Sign In · Burgonomics Partner');
  });

  it('titles the kitchen display', () => {
    expect(titleForPath('/kds')).toBe('Kitchen Display · Burgonomics Partner');
  });

  it('titles a nested order route by its section', () => {
    expect(titleForPath('/orders/abc123')).toBe('Orders · Burgonomics Partner');
  });

  it('titles the control room', () => {
    expect(titleForPath('/admin/refunds')).toBe('Control Room · Burgonomics Partner');
  });

  it('uses the brand title for an unknown path', () => {
    expect(titleForPath('/nope')).toBe('Burgonomics Partner');
  });
});
