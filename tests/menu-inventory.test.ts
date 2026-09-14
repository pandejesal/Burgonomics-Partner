import { describe, it, expect } from 'vitest';

export interface MenuItemInventory {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  isAvailable: boolean; // 86ed status
  unavailableBranchIds: string[];
}

export interface ComboBuilderItem {
  id: string;
  title: string;
  baseItemIds: string[];
  discountPercentage: number;
  customModifiers: {
    name: string;
    price: number;
    selected: boolean;
  }[];
}

export function toggleItem86Status(
  item: MenuItemInventory,
  branchId: string,
  outOfStock: boolean
): MenuItemInventory {
  const branchSet = new Set(item.unavailableBranchIds || []);
  if (outOfStock) {
    branchSet.add(branchId);
  } else {
    branchSet.delete(branchId);
  }
  const unavailableList = Array.from(branchSet);
  return {
    ...item,
    unavailableBranchIds: unavailableList,
    isAvailable: unavailableList.length === 0,
  };
}

export function calculateComboPrice(
  combo: ComboBuilderItem,
  itemPriceMap: Record<string, number>
): { subtotal: number; discountAmount: number; finalPrice: number } {
  const baseItemsSum = combo.baseItemIds.reduce((sum, id) => sum + (itemPriceMap[id] || 0), 0);
  const modifiersSum = combo.customModifiers
    .filter((m) => m.selected)
    .reduce((sum, m) => sum + m.price, 0);

  const subtotal = baseItemsSum + modifiersSum;
  const discountAmount = Math.round(subtotal * (combo.discountPercentage / 100));
  const finalPrice = Math.max(0, subtotal - discountAmount);

  return { subtotal, discountAmount, finalPrice };
}

describe('Partner Menu Inventory 86ing & Combo Builder Suite', () => {
  it('instantly 86es (marks out-of-stock) a menu item for a specific branch', () => {
    const item: MenuItemInventory = {
      id: 'item_truffle_burger',
      name: 'Signature Truffle Burger',
      category: 'Burgers',
      basePrice: 249,
      isAvailable: true,
      unavailableBranchIds: [],
    };

    // 86 item for branch_surat_01
    const updated = toggleItem86Status(item, 'branch_surat_01', true);
    expect(updated.unavailableBranchIds).toContain('branch_surat_01');
    expect(updated.isAvailable).toBe(false);

    // 86 item for branch_ahmedabad_01 as well
    const multiBranch = toggleItem86Status(updated, 'branch_ahmedabad_01', true);
    expect(multiBranch.unavailableBranchIds).toHaveLength(2);

    // Restore stock at branch_surat_01
    const restored = toggleItem86Status(multiBranch, 'branch_surat_01', false);
    expect(restored.unavailableBranchIds).not.toContain('branch_surat_01');
    expect(restored.unavailableBranchIds).toContain('branch_ahmedabad_01');
    expect(restored.isAvailable).toBe(false);

    // Restore stock at branch_ahmedabad_01
    const fullyRestored = toggleItem86Status(restored, 'branch_ahmedabad_01', false);
    expect(fullyRestored.unavailableBranchIds).toHaveLength(0);
    expect(fullyRestored.isAvailable).toBe(true);
  });

  it('correctly calculates combo meal price with discount percentage and optional modifiers', () => {
    const prices: Record<string, number> = {
      item_classic_burger: 179,
      item_peri_fries: 99,
      item_cold_coffee: 119,
    };

    const combo: ComboBuilderItem = {
      id: 'combo_classic_meal',
      title: 'Classic Burger Meal',
      baseItemIds: ['item_classic_burger', 'item_peri_fries', 'item_cold_coffee'],
      discountPercentage: 15, // 15% combo discount
      customModifiers: [
        { name: 'Extra Cheese Slice', price: 30, selected: true },
        { name: 'Double Patty', price: 60, selected: false },
        { name: 'Chipotle Dip', price: 25, selected: true },
      ],
    };

    // Base: 179 + 99 + 119 = 397
    // Modifiers: 30 + 25 = 55
    // Subtotal: 452
    // Discount: 15% of 452 = 67.8 -> 68
    // Final: 452 - 68 = 384
    const calculation = calculateComboPrice(combo, prices);
    expect(calculation.subtotal).toBe(452);
    expect(calculation.discountAmount).toBe(68);
    expect(calculation.finalPrice).toBe(384);
  });
});
