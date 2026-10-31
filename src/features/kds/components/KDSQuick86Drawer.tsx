import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useBranchMenu } from '@/features/menu/hooks/useBranchMenu';
import type { MenuItem } from '@/types';

export interface KDSQuick86DrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Single source of truth for "sellable": every flag defaults to true. */
export function isItemInStock(item: MenuItem): boolean {
  if (item.inStock === false) return false;
  if (item.isAvailable === false) return false;
  if (item.available === false) return false;
  return true;
}

export function filter86Items(items: MenuItem[], query: string): MenuItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const name = (item.name || '').toLowerCase();
    const category = String(
      (item as unknown as Record<string, unknown>).category ?? item.categoryId ?? '',
    ).toLowerCase();
    return name.includes(q) || category.includes(q);
  });
}

/** Args for the 1-tap toggle: in-stock -> 86 it (false), 86'd -> restore (true). */
export function get86ToggleArgs(item: MenuItem): { itemId: string; available: boolean } {
  return { itemId: item.id, available: !isItemInStock(item) };
}

export function KDSQuick86Drawer({ isOpen, onClose }: KDSQuick86DrawerProps) {
  const [query, setQuery] = useState('');
  const { items, toggleAvailability, markItem86 } = useBranchMenu();
  void markItem86;

  const filtered = useMemo(
    () => filter86Items(items ?? [], query),
    [items, query],
  );

  if (!isOpen) return null;

  type ToggleArgs = { itemId: string; available: boolean };
  type ToggleShape = ((args: ToggleArgs) => void) | { mutate?: (args: ToggleArgs) => void; isPending?: boolean };
  const rawToggle = toggleAvailability as unknown as ToggleShape;
  const isToggling =
    typeof rawToggle === 'function' ? false : (rawToggle.isPending ?? false);

  const handleToggle = (item: MenuItem) => {
    const args = get86ToggleArgs(item);
    if (typeof rawToggle === 'function') {
      rawToggle(args);
      return;
    }
    rawToggle.mutate?.(args);
  };

  const inStockCount = (items ?? []).filter(isItemInStock).length;
  const outCount = (items ?? []).length - inStockCount;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="86 quick toggle drawer"
    >
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-hidden="true"
        data-testid="86-drawer-backdrop"
      />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md shadow-2xl bg-[#121212] border-l border-neutral-800 text-white flex flex-col">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-neutral-800">
          <div className="min-w-0">
            <h2 className="text-sm font-black uppercase tracking-wider">86 / Stock</h2>
            <p className="text-[11px] text-neutral-400 font-medium">
              1-tap out-of-stock toggle &bull; {inStockCount} in stock &bull; {outCount} 86&rsquo;d
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close 86 drawer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 text-xs font-bold transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Done</span>
          </button>
        </div>

        <div className="px-4 py-3 border-b border-neutral-800">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items or categories..."
              aria-label="Search menu items"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-sm text-white placeholder:text-neutral-500 outline-none focus:border-neutral-600"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {filtered.length === 0 ? (
            <p className="text-xs text-neutral-500 italic py-6 text-center">
              {query.trim()
                ? `No items match "${query.trim()}".`
                : 'No menu items found for this outlet.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((item) => {
                const inStock = isItemInStock(item);
                const categoryLabel = String(
                  (item as unknown as Record<string, unknown>).category ??
                    item.categoryId ??
                    'uncategorized',
                );
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-neutral-900/90 border border-neutral-800"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white leading-tight truncate">
                        {item.name}
                      </p>
                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 text-[10px] font-bold uppercase tracking-wider">
                        {categoryLabel}
                      </span>
                    </div>
                    <button
                      type="button"
                      data-testid={`86-toggle-${item.id}`}
                      disabled={isToggling}
                      onClick={() => handleToggle(item)}
                      aria-pressed={!inStock}
                      aria-label={`${item.name} is ${inStock ? 'in stock' : '86 sold out'} — tap to mark ${inStock ? 'out of stock' : 'back in stock'}`}
                      className={`shrink-0 px-3 py-2 rounded-xl text-xs font-black border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        inStock
                          ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60'
                          : 'border-rose-500/50 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60'
                      }`}
                    >
                      {inStock ? 'IN STOCK' : '86 SOLD OUT'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

export default KDSQuick86Drawer;
