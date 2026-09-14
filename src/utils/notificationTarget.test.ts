import { describe, it, expect } from 'vitest';
import { notificationTarget } from './notificationTarget';

describe('notificationTarget', () => {
  it('routes ticket notifications by targetId, never by subject', () => {
    expect(notificationTarget('ticket', 'tkt_001')).toBe('/tickets/tkt_001');
  });

  it('routes order notifications by targetId', () => {
    expect(notificationTarget('order', 'ord_901')).toBe('/orders/ord_901');
  });

  it('routes chat notifications to the hub (no per-thread id in the contract)', () => {
    expect(notificationTarget('chat', 'anything')).toBe('/chat');
    expect(notificationTarget('chat')).toBe('/chat');
  });

  it('returns null for system/unknown types (stay on inbox, never mis-navigate)', () => {
    expect(notificationTarget('system', 'tkt_001')).toBeNull();
  });

  it('returns null when ticket/order id is missing', () => {
    expect(notificationTarget('ticket')).toBeNull();
    expect(notificationTarget('ticket', '')).toBeNull();
    expect(notificationTarget('order', undefined)).toBeNull();
  });

  it('rejects unsafe ids instead of building paths from them', () => {
    expect(notificationTarget('ticket', '../admin')).toBeNull();
    expect(notificationTarget('ticket', '/orders/x')).toBeNull();
    expect(notificationTarget('order', 'javascript:alert(1)')).toBeNull();
    expect(notificationTarget('ticket', 'a'.repeat(65))).toBeNull();
  });
});
