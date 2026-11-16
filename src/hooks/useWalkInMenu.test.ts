import { describe, it, expect } from 'vitest';
import {
  evaluateWalkInEligibility,
  projectStrictWalkInCatalog,
  type RawProductDocData,
} from './useMenu';

describe('Strict Walk-in Menu Seam: evaluateWalkInEligibility & projectStrictWalkInCatalog', () => {
  const branchId = 'br_cybercity_01';

  it('marks a valid in-stock product with finite non-negative price as eligible', () => {
    const raw: RawProductDocData = {
      name: 'Paneer Makhani Burst Burger',
      branchId,
      inStock: true,
      price: 199,
      petpoojaItemId: 'PP-101',
    };
    const result = evaluateWalkInEligibility('prod_01', raw, branchId);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.item?.id).toBe('prod_01');
    expect(result.item?.price).toBe(199);
    expect(result.item?.inStock).toBe(true);
    expect(result.item?.petpoojaItemId).toBe('PP-101');
  });

  it('refuses product when inStock is false, missing, null, or non-boolean true', () => {
    const missingStock: RawProductDocData = {
      name: 'Burger',
      branchId,
      price: 150,
    };
    expect(evaluateWalkInEligibility('p1', missingStock, branchId).eligible).toBe(false);
    expect(evaluateWalkInEligibility('p1', missingStock, branchId).reason).toBe('out_of_stock');

    const falseStock: RawProductDocData = {
      name: 'Burger',
      branchId,
      inStock: false,
      price: 150,
    };
    expect(evaluateWalkInEligibility('p2', falseStock, branchId).eligible).toBe(false);
    expect(evaluateWalkInEligibility('p2', falseStock, branchId).reason).toBe('out_of_stock');

    const truthyStock: RawProductDocData = {
      name: 'Burger',
      branchId,
      inStock: 'true' as any,
      price: 150,
    };
    expect(evaluateWalkInEligibility('p3', truthyStock, branchId).eligible).toBe(false);
    expect(evaluateWalkInEligibility('p3', truthyStock, branchId).reason).toBe('out_of_stock');
  });

  it('refuses product with invalid, NaN, Infinity, negative, or missing prices', () => {
    const nanPrice: RawProductDocData = {
      name: 'Burger',
      branchId,
      inStock: true,
      price: NaN,
    };
    expect(evaluateWalkInEligibility('p1', nanPrice, branchId).eligible).toBe(false);
    expect(evaluateWalkInEligibility('p1', nanPrice, branchId).reason).toBe('invalid_price');

    const infPrice: RawProductDocData = {
      name: 'Burger',
      branchId,
      inStock: true,
      price: Infinity,
    };
    expect(evaluateWalkInEligibility('p2', infPrice, branchId).eligible).toBe(false);
    expect(evaluateWalkInEligibility('p2', infPrice, branchId).reason).toBe('invalid_price');

    const negPrice: RawProductDocData = {
      name: 'Burger',
      branchId,
      inStock: true,
      price: -10,
    };
    expect(evaluateWalkInEligibility('p3', negPrice, branchId).eligible).toBe(false);
    expect(evaluateWalkInEligibility('p3', negPrice, branchId).reason).toBe('invalid_price');

    const tooHighPrice: RawProductDocData = {
      name: 'Burger',
      branchId,
      inStock: true,
      price: 100001,
    };
    expect(evaluateWalkInEligibility('p4', tooHighPrice, branchId).eligible).toBe(false);
    expect(evaluateWalkInEligibility('p4', tooHighPrice, branchId).reason).toBe('invalid_price');

    const missingPrice: RawProductDocData = {
      name: 'Burger',
      branchId,
      inStock: true,
    };
    expect(evaluateWalkInEligibility('p5', missingPrice, branchId).eligible).toBe(false);
    expect(evaluateWalkInEligibility('p5', missingPrice, branchId).reason).toBe('invalid_price');
  });

  it('refuses product when priceAvailable is explicitly false', () => {
    const raw: RawProductDocData = {
      name: 'Burger',
      branchId,
      inStock: true,
      price: 199,
      priceAvailable: false,
    };
    const result = evaluateWalkInEligibility('p1', raw, branchId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('price_unavailable');
  });

  it('refuses configurable products (priceFromVariation===true or non-empty/malformed customizations)', () => {
    const variationPrice: RawProductDocData = {
      name: 'Burger',
      branchId,
      inStock: true,
      price: 199,
      priceFromVariation: true,
    };
    expect(evaluateWalkInEligibility('p1', variationPrice, branchId).eligible).toBe(false);
    expect(evaluateWalkInEligibility('p1', variationPrice, branchId).reason).toBe('configurable_unsupported');

    const withCustomizations: RawProductDocData = {
      name: 'Burger',
      branchId,
      inStock: true,
      price: 199,
      customizations: [{ id: 'cheese', name: 'Extra Cheese', price: 30 }],
    };
    expect(evaluateWalkInEligibility('p2', withCustomizations, branchId).eligible).toBe(false);
    expect(evaluateWalkInEligibility('p2', withCustomizations, branchId).reason).toBe('configurable_unsupported');

    const malformedCustomizations: RawProductDocData = {
      name: 'Burger',
      branchId,
      inStock: true,
      price: 199,
      customizations: 'yes' as any,
    };
    expect(evaluateWalkInEligibility('p3', malformedCustomizations, branchId).eligible).toBe(false);
    expect(evaluateWalkInEligibility('p3', malformedCustomizations, branchId).reason).toBe('configurable_unsupported');
  });

  it('allows empty array for customizations', () => {
    const emptyCustomizations: RawProductDocData = {
      name: 'Burger',
      branchId,
      inStock: true,
      price: 199,
      customizations: [],
    };
    const result = evaluateWalkInEligibility('p1', emptyCustomizations, branchId);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('rejects null customizations just like the server instead of treating it as absent', () => {
    const raw = { name: 'Burger', branchId, inStock: true, price: 199, customizations: null };
    expect(evaluateWalkInEligibility('null-options', raw, branchId)).toEqual({
      eligible: false, reason: 'configurable_unsupported',
    });
  });

  it('never marks an ineligible display row as available, including missing and invalid prices', () => {
    const catalog = projectStrictWalkInCatalog([
      { id: 'bad-price', data: { name: 'No price', branchId, inStock: true } },
      { id: 'options', data: { name: 'Options required', branchId, inStock: true, price: 100, customizations: [{}] } },
      { id: 'foreign', data: { name: 'Foreign product', branchId: 'foreign', inStock: true, price: 100 } },
    ], branchId);
    expect(catalog.eligibleItems).toEqual([]);
    expect(catalog.ineligibleItems.map((item) => item.id)).toEqual(['bad-price', 'options', 'foreign']);
    for (const item of catalog.allItems) {
      expect(item.available).toBe(false);
      expect(item.isAvailable).toBe(false);
      expect(item.inStock).toBe(false);
    }
  });

  it('refuses products that do not match the target branch or lack a valid name', () => {
    const wrongBranch: RawProductDocData = {
      name: 'Burger',
      branchId: 'other_branch',
      inStock: true,
      price: 199,
    };
    expect(evaluateWalkInEligibility('p1', wrongBranch, branchId).eligible).toBe(false);
    expect(evaluateWalkInEligibility('p1', wrongBranch, branchId).reason).toBe('branch_mismatch');

    const blankName: RawProductDocData = {
      name: '   ',
      branchId,
      inStock: true,
      price: 199,
    };
    expect(evaluateWalkInEligibility('p2', blankName, branchId).eligible).toBe(false);
    expect(evaluateWalkInEligibility('p2', blankName, branchId).reason).toBe('invalid_name');
  });

  it('projectStrictWalkInCatalog produces partitioned eligible and ineligible items with reasons', () => {
    const docs = [
      {
        id: 'p1',
        data: { name: 'Item 1', branchId, inStock: true, price: 100 },
      },
      {
        id: 'p2',
        data: { name: 'Item 2', branchId, inStock: false, price: 100 },
      },
      {
        id: 'p3',
        data: { name: 'Item 3', branchId, inStock: true, price: 100, priceFromVariation: true },
      },
    ];

    const projected = projectStrictWalkInCatalog(docs, branchId);
    expect(projected.eligibleItems).toHaveLength(1);
    expect(projected.eligibleItems[0].id).toBe('p1');
    expect(projected.ineligibleItems).toHaveLength(2);
    expect(projected.ineligibleItems.find((i) => i.id === 'p2')?.reason).toBe('out_of_stock');
    expect(projected.ineligibleItems.find((i) => i.id === 'p3')?.reason).toBe('configurable_unsupported');
  });

  it('projectStrictWalkInCatalog on empty raw catalog returns empty arrays without demo items or seeding', () => {
    const projected = projectStrictWalkInCatalog([], branchId);
    expect(projected.eligibleItems).toEqual([]);
    expect(projected.ineligibleItems).toEqual([]);
    expect(projected.allItems).toEqual([]);
  });
});
