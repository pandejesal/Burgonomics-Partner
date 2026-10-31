import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MenuItemToggleRow } from './MenuItemToggleRow';
import type { MenuItem } from '@/types';

/**
 * A11Y-02: the 86 toggle is a `role="switch"` with no accessible name, so a
 * screen-reader user hears "switch, on" with no idea WHICH item it 86s. The
 * name must carry the item (e.g. "Cheese Slice availability") and the
 * aria-checked value must mirror the real availability state.
 */
const baseItem: MenuItem = {
  id: 'item_cheese_slice',
  name: 'Cheese Slice',
  description: 'A slice of cheese',
  price: 99,
  categoryId: 'cat_sides',
};

function render(item: MenuItem) {
  return renderToStaticMarkup(
    <MenuItemToggleRow item={item} canEdit onToggleStock={() => {}} />
  );
}

describe('MenuItemToggleRow (A11Y-02)', () => {
  it('names the 86 switch with the item name', () => {
    const html = render({ ...baseItem, inStock: true });
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-label="Cheese Slice availability"');
  });

  it('reports aria-checked=true when the item is in stock', () => {
    const html = render({ ...baseItem, inStock: true });
    expect(html).toMatch(/aria-checked="true"/);
  });

  it('reports aria-checked=false when the item is 86ed', () => {
    const html = render({ ...baseItem, inStock: false, eightSixReason: 'no cheese' });
    expect(html).toMatch(/aria-checked="false"/);
    expect(html).toContain('aria-label="Cheese Slice availability"');
  });
});
