import { useState } from 'react';
import { useMenu } from '@/hooks/useMenu';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import {
  UtensilsCrossed,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function MenuPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [syncSuccess, setSyncSuccess] = useState(false);
  const {
    categories,
    items,
    isLoading,
    lastSyncedAt,
    toggleAvailability,
    syncPetpooja,
  } = useMenu();

  const handleManualSync = async () => {
    try {
      await syncPetpooja.mutateAsync();
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
    } catch (err) {
      console.error('Petpooja sync failed:', err);
    }
  };

  const filteredItems =
    selectedCategory === 'all'
      ? items
      : items?.filter((item) => item.categoryId === selectedCategory);

  const syncedAgo = (() => {
    try {
      if (lastSyncedAt?.toDate) {
        return formatDistanceToNow(lastSyncedAt.toDate(), { addSuffix: true });
      }
      return 'Just now';
    } catch {
      return 'Recently';
    }
  })();

  return (
    <div className="space-y-6">
      {/* Header with Title & Petpooja Sync Action */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-text-primary tracking-tight">
              Menu & Catalog Management
            </h1>
            <Badge className="bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-bold uppercase">
              Petpooja POS Live
            </Badge>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            100% Pure Veg catalog synced hourly. Manage instant 86-ing & stock availability.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastSyncedAt && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-text-secondary bg-surface px-3 py-1.5 rounded-xl border border-border">
              <Clock className="w-3.5 h-3.5 text-purple-600" />
              <span>Synced {syncedAgo}</span>
            </div>
          )}

          <button
            onClick={handleManualSync}
            disabled={syncPetpooja.isPending}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-xs cursor-pointer ${
              syncSuccess
                ? 'bg-green-600 text-white'
                : 'bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50'
            }`}
          >
            {syncSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>63 Items Synced!</span>
              </>
            ) : (
              <>
                <RefreshCw
                  className={`w-4 h-4 ${syncPetpooja.isPending ? 'animate-spin' : ''}`}
                />
                <span>
                  {syncPetpooja.isPending
                    ? 'Syncing Petpooja...'
                    : 'Sync with Petpooja POS'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* Category Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-xl whitespace-nowrap font-bold text-xs transition-colors cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-primary text-white shadow-2xs'
                  : 'bg-surface border border-border text-text-secondary hover:bg-primary/5 hover:text-text-primary'
              }`}
            >
              All Items ({items?.length || 0})
            </button>
            {categories?.map((cat) => {
              const count =
                items?.filter((i) => i.categoryId === cat.id).length || 0;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-2 rounded-xl whitespace-nowrap font-bold text-xs transition-colors cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-primary text-white shadow-2xs'
                      : 'bg-surface border border-border text-text-secondary hover:bg-primary/5 hover:text-text-primary'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>

          {/* Menu Items Grid */}
          {!filteredItems?.length ? (
            <div className="text-center py-16 bg-surface rounded-2xl border border-border">
              <UtensilsCrossed className="w-12 h-12 mx-auto text-text-secondary mb-4 opacity-50" />
              <h3 className="font-bold text-text-primary">No menu items found</h3>
              <p className="text-xs text-text-secondary mt-1">
                Click "Sync with Petpooja POS" above to load the full 63-item catalog.
              </p>
              <button
                onClick={handleManualSync}
                className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold"
              >
                Sync 63 Items Now
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-surface rounded-2xl border border-border overflow-hidden shadow-2xs hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    {/* Image */}
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-44 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-44 bg-primary/5 flex items-center justify-center">
                        <UtensilsCrossed className="w-10 h-10 text-primary/40" />
                      </div>
                    )}

                    {/* Content */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-text-primary text-sm leading-snug">
                              {item.name}
                            </h3>
                            {item.veg && (
                              <span
                                className="w-4 h-4 rounded-sm border border-green-600 flex items-center justify-center p-0.5 shrink-0"
                                title="100% Pure Veg"
                              >
                                <span className="w-2 h-2 rounded-full bg-green-600" />
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-text-secondary font-mono mt-0.5">
                            ID: {item.petpoojaItemId || item.id}
                          </p>
                          {item.description && (
                            <p className="text-xs text-text-secondary mt-1.5 line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                          )}
                        </div>
                        <p className="font-black text-primary text-base whitespace-nowrap">
                          ₹{item.price}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="px-4 py-3 bg-bg/50 border-t border-border flex items-center justify-between">
                    <Badge
                      className={
                        item.available
                          ? 'bg-green-100 text-green-800'
                          : 'bg-rose-100 text-rose-800'
                      }
                    >
                      {item.available ? 'In Stock' : '86-ed / Out of Stock'}
                    </Badge>

                    <button
                      onClick={() =>
                        toggleAvailability.mutate({
                          itemId: item.id,
                          available: !item.available,
                        })
                      }
                      disabled={toggleAvailability.isPending}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
                        item.available
                          ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                          : 'bg-green-50 text-green-600 hover:bg-green-100'
                      }`}
                      title={
                        item.available ? 'Mark Out of Stock' : 'Mark In Stock'
                      }
                    >
                      {item.available ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>86 Item</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Make Available</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MenuPage;
