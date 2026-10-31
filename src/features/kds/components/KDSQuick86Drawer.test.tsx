import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { MenuItem } from '@/types';

const mockState = vi.hoisted(() => ({
  items: [
    {
      id: 'item-1',
      name: 'Classic Smash Burger',
      description: '',
      price: 199,
      categoryId: 'burgers',
      category: 'Burgers',
      inStock: true,
      isAvailable: true,
      available: true,
    },
    {
      id: 'item-2',
      name: 'Peri Peri Fries',
      description: '',
      price: 99,
      categoryId: 'sides',
      category: 'Sides',
      inStock: false,
      isAvailable: false,
      available: false,
    },
    {
      id: 'item-3',
      name: 'Belgian Chocolate Shake',
      description: '',
      price: 149,
      categoryId: 'beverages',
      category: 'Beverages',
      inStock: true,
      isAvailable: true,
      available: true,
    },
  ] as MenuItem[],
  mutate: vi.fn(),
}));

vi.mock('@/features/menu/hooks/useBranchMenu', () => ({
  useBranchMenu: () => ({
    items: mockState.items,
    toggleAvailability: { mutate: mockState.mutate, isPending: false },
    markItem86: { mutate: vi.fn(), isPending: false },
  }),
}));

import {
  KDSQuick86Drawer,
  filter86Items,
  get86ToggleArgs,
  isItemInStock,
} from './KDSQuick86Drawer';

beforeEach(() => {
  mockState.mutate.mockClear();
});

describe('KDSQuick86Drawer', () => {
  it('renders items list with names, category badges, and both toggle states', () => {
    const html = renderToString(<KDSQuick86Drawer isOpen onClose={() => {}} />);
    expect(html).toContain('Classic Smash Burger');
    expect(html).toContain('Peri Peri Fries');
    expect(html).toContain('Belgian Chocolate Shake');
    expect(html).toContain('Burgers');
    expect(html).toContain('Sides');
    expect(html).toContain('IN STOCK');
    expect(html).toContain('86 SOLD OUT');
  });

  it('renders nothing when closed', () => {
    const html = renderToString(<KDSQuick86Drawer isOpen={false} onClose={() => {}} />);
    expect(html).toBe('');
  });

  it('renders close button and backdrop wired to onClose', () => {
    const html = renderToString(<KDSQuick86Drawer isOpen onClose={() => {}} />);
    expect(html).toContain('Close 86 drawer');
    expect(html).toContain('86-drawer-backdrop');
  });

  it('close button triggers onClose (contract)', () => {
    const onClose = vi.fn();
    onClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filters items by name (case-insensitive)', () => {
    const results = filter86Items(mockState.items, 'smash');
    expect(results.map((i) => i.id)).toEqual(['item-1']);
    expect(filter86Items(mockState.items, 'SMASH').map((i) => i.id)).toEqual(['item-1']);
  });

  it('filters items by category', () => {
    const results = filter86Items(mockState.items, 'sides');
    expect(results.map((i) => i.id)).toEqual(['item-2']);
  });

  it('returns all items on empty query and none on no-match', () => {
    expect(filter86Items(mockState.items, '')).toHaveLength(3);
    expect(filter86Items(mockState.items, '   ')).toHaveLength(3);
    expect(filter86Items(mockState.items, 'zzz-no-such-item')).toHaveLength(0);
  });

  it('resolves stock from inStock/isAvailable/available flags', () => {
    const base = mockState.items[0];
    expect(isItemInStock(base)).toBe(true);
    expect(isItemInStock({ ...base, inStock: false })).toBe(false);
    expect(isItemInStock({ ...base, isAvailable: false })).toBe(false);
    expect(isItemInStock({ ...base, available: false })).toBe(false);
  });

  it('1-tap toggles an in-stock item to out-of-stock (available: false)', () => {
    const item = mockState.items[0];
    expect(isItemInStock(item)).toBe(true);
    const args = get86ToggleArgs(item);
    expect(args).toEqual({ itemId: 'item-1', available: false });
    mockState.mutate(args);
    expect(mockState.mutate).toHaveBeenCalledWith({ itemId: 'item-1', available: false });
  });

  it('1-tap toggles an out-of-stock item back to in-stock (available: true)', () => {
    const item = mockState.items[1];
    expect(isItemInStock(item)).toBe(false);
    const args = get86ToggleArgs(item);
    expect(args).toEqual({ itemId: 'item-2', available: true });
    mockState.mutate(args);
    expect(mockState.mutate).toHaveBeenCalledWith({ itemId: 'item-2', available: true });
  });
});
