import type { MenuItem } from '@/types';

export interface RawProductDocData {
  name?: string;
  branchId?: string;
  inStock?: boolean;
  price?: number;
  priceAvailable?: boolean;
  priceFromVariation?: boolean;
  customizations?: any;
  categoryId?: string;
  categoryName?: string;
  description?: string;
  imageUrl?: string;
  image?: string;
  isVeg?: boolean;
  veg?: boolean;
  isJain?: boolean;
  isBestSeller?: boolean;
  petpoojaItemId?: string;
  [key: string]: any;
}

export type WalkInIneligibilityReason =
  | 'branch_mismatch'
  | 'out_of_stock'
  | 'invalid_price'
  | 'price_unavailable'
  | 'invalid_name'
  | 'configurable_unsupported';

export interface WalkInEligibilityResult {
  eligible: boolean;
  reason?: WalkInIneligibilityReason;
  item?: MenuItem;
}

export interface IneligibleWalkInItem {
  id: string;
  name: string;
  price: number;
  reason: WalkInIneligibilityReason;
  raw: RawProductDocData;
  item?: MenuItem;
}

export interface StrictWalkInCatalog {
  eligibleItems: MenuItem[];
  ineligibleItems: IneligibleWalkInItem[];
  allItems: MenuItem[];
}

/**
 * Validates a single raw product document according to the backend walk-in contract:
 * - product.branchId matches the requested branch exactly
 * - inStock is exactly true (boolean true, not truthy, not missing)
 * - price is a number, finite, >= 0 and <= 100000; priceAvailable is not false
 * - name is a nonblank string
 * - customizations is absent or an empty array; malformed/nonempty customizations are unsupported
 * - priceFromVariation is not true
 */
export function evaluateWalkInEligibility(
  id: string,
  raw: RawProductDocData | undefined | null,
  branchId: string
): WalkInEligibilityResult {
  if (!raw) {
    return { eligible: false, reason: 'invalid_name' };
  }

  if (raw.branchId !== branchId) {
    return { eligible: false, reason: 'branch_mismatch' };
  }

  if (typeof raw.name !== 'string' || raw.name.trim() === '') {
    return { eligible: false, reason: 'invalid_name' };
  }

  if (raw.inStock !== true) {
    return { eligible: false, reason: 'out_of_stock' };
  }

  if (raw.priceAvailable === false) {
    return { eligible: false, reason: 'price_unavailable' };
  }

  if (
    typeof raw.price !== 'number' ||
    !Number.isFinite(raw.price) ||
    raw.price < 0 ||
    raw.price > 100000
  ) {
    return { eligible: false, reason: 'invalid_price' };
  }

  if (raw.priceFromVariation === true) {
    return { eligible: false, reason: 'configurable_unsupported' };
  }

  if (raw.customizations !== undefined) {
    if (!Array.isArray(raw.customizations) || raw.customizations.length > 0) {
      return { eligible: false, reason: 'configurable_unsupported' };
    }
  }

  const inStock = true;
  const item: MenuItem = {
    id,
    name: raw.name,
    description: raw.description || '',
    price: raw.price,
    categoryId: raw.categoryId || 'uncategorized',
    category: raw.categoryName,
    image: raw.imageUrl || raw.image,
    available: inStock,
    isAvailable: inStock,
    inStock,
    veg: raw.isVeg ?? raw.veg ?? true,
    isVeg: raw.isVeg ?? raw.veg ?? true,
    isJain: raw.isJain ?? false,
    isBestSeller: raw.isBestSeller ?? false,
    petpoojaItemId: raw.petpoojaItemId,
    eightSixDuration: raw.eightSixDuration,
    eightSixReason: raw.eightSixReason,
    disabledUntil: raw.disabledUntil ?? null,
    isCombo: raw.isCombo,
    originalPrice: raw.originalPrice,
    comboComponents: raw.comboComponents,
    lastSyncedAt: raw.lastSyncedAt,
  };

  return { eligible: true, item };
}

/**
 * Projects a raw list of Firestore document snapshots or objects into a partitioned
 * strict walk-in catalog.
 * Does not seed demo items or modify raw documents.
 */
export function projectStrictWalkInCatalog(
  docs: Array<{ id: string; data: RawProductDocData | (() => RawProductDocData) }>,
  branchId: string
): StrictWalkInCatalog {
  const eligibleItems: MenuItem[] = [];
  const ineligibleItems: IneligibleWalkInItem[] = [];
  const allItems: MenuItem[] = [];

  for (const doc of docs) {
    const raw = typeof doc.data === 'function' ? doc.data() : doc.data;
    const result = evaluateWalkInEligibility(doc.id, raw, branchId);

    // Build a MenuItem representation for allItems (for UI display purposes)
    const inStock = false;
    const itemRepresentation: MenuItem = result.item || {
      id: doc.id,
      name: typeof raw?.name === 'string' && raw.name.trim() !== '' ? raw.name : 'Item',
      description: raw?.description || '',
      price: typeof raw?.price === 'number' && Number.isFinite(raw.price) ? raw.price : 0,
      categoryId: raw?.categoryId || 'uncategorized',
      category: raw?.categoryName,
      image: raw?.imageUrl || raw?.image,
      available: inStock,
      isAvailable: inStock,
      inStock,
      veg: raw?.isVeg ?? raw?.veg ?? true,
      isVeg: raw?.isVeg ?? raw?.veg ?? true,
      isJain: raw?.isJain ?? false,
      isBestSeller: raw?.isBestSeller ?? false,
      petpoojaItemId: raw?.petpoojaItemId,
      eightSixDuration: raw?.eightSixDuration,
      eightSixReason: raw?.eightSixReason,
      disabledUntil: raw?.disabledUntil ?? null,
      isCombo: raw?.isCombo,
      originalPrice: raw?.originalPrice,
      comboComponents: raw?.comboComponents,
      lastSyncedAt: raw?.lastSyncedAt,
    };

    allItems.push(itemRepresentation);

    if (result.eligible && result.item) {
      eligibleItems.push(result.item);
    } else {
      ineligibleItems.push({
        id: doc.id,
        name: typeof raw?.name === 'string' && raw.name.trim() !== '' ? raw.name : 'Unknown Item',
        price: typeof raw?.price === 'number' && Number.isFinite(raw.price) ? raw.price : 0,
        reason: result.reason || 'branch_mismatch',
        raw: raw || {},
        item: itemRepresentation,
      });
    }
  }

  return {
    eligibleItems,
    ineligibleItems,
    allItems,
  };
}
