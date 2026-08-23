import { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import { useAppStore } from '@/stores/appStore';
import { Building2, ChevronDown, Check, Search, Store } from 'lucide-react';

export function BranchSwitcher() {
  const { user } = useAuth();
  const { branches } = useBranches();
  const { selectedBranchId, setSelectedBranchId } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // Filter branches accessible to current user
  const accessibleBranches = useMemo(() => {
    if (!user) return [];
    if (user.role === 'brand_owner') {
      return branches;
    }
    if (user.role === 'regional_manager') {
      const cityList = user.cityIds?.length ? user.cityIds : ['Ahmedabad', 'Surat'];
      return branches.filter((b) => cityList.includes(b.city));
    }
    // branch_owner
    const userBranchIds = user.branchIds?.length ? user.branchIds : [];
    return branches.filter((b) => userBranchIds.includes(b.id));
  }, [branches, user]);

  // Selected branch object
  const activeBranch = useMemo(() => {
    if (!selectedBranchId) return null;
    return accessibleBranches.find((b) => b.id === selectedBranchId) || null;
  }, [accessibleBranches, selectedBranchId]);

  // Filtered branches by search query
  const filteredBranches = useMemo(() => {
    if (!search.trim()) return accessibleBranches;
    const query = search.toLowerCase();
    return accessibleBranches.filter(
      (b) => b.name.toLowerCase().includes(query) || b.city.toLowerCase().includes(query)
    );
  }, [accessibleBranches, search]);

  // Group by City
  const branchesByCity = useMemo(() => {
    const groups: Record<string, typeof accessibleBranches> = {};
    filteredBranches.forEach((b) => {
      const city = b.city || 'Other Outlets';
      if (!groups[city]) groups[city] = [];
      groups[city].push(b);
    });
    return groups;
  }, [filteredBranches]);

  // If user is a branch owner with only 1 assigned branch, show a locked chip
  if (user?.role === 'branch_owner') {
    const branchName = activeBranch?.name || accessibleBranches[0]?.name || 'My Outlet';
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-xl text-xs font-semibold">
        <Store className="w-3.5 h-3.5 text-primary" />
        <span className="truncate max-w-[150px] sm:max-w-[200px]">{branchName}</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-bg/80 hover:bg-bg text-text-primary border border-border rounded-xl text-xs font-medium transition-colors cursor-pointer shadow-2xs"
        aria-expanded={isOpen}
      >
        <Building2 className="w-4 h-4 text-primary shrink-0" />
        <span className="font-semibold text-text-primary truncate max-w-[140px] sm:max-w-[180px]">
          {activeBranch ? activeBranch.name : 'All Outlets (Aggregated)'}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-text-secondary transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-72 bg-surface rounded-2xl border border-border shadow-xl z-50 overflow-hidden flex flex-col max-h-[380px] animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Search bar inside dropdown */}
          <div className="p-2.5 border-b border-border bg-bg/40">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-text-secondary absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter outlets by name or city..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-surface"
                autoFocus
              />
            </div>
          </div>

          {/* List items */}
          <div className="overflow-y-auto p-1.5 space-y-1 divide-y divide-border/40">
            {/* Option: All Outlets */}
            <button
              onClick={() => {
                setSelectedBranchId(null);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left ${
                selectedBranchId === null
                  ? 'bg-primary text-white shadow-2xs'
                  : 'text-text-primary hover:bg-primary/5'
              }`}
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <div>
                  <p className="leading-tight">All Outlets (Aggregated)</p>
                  <p
                    className={`text-[10px] ${
                      selectedBranchId === null ? 'text-white/80' : 'text-text-secondary'
                    }`}
                  >
                    {accessibleBranches.length} active stores
                  </p>
                </div>
              </div>
              {selectedBranchId === null && <Check className="w-4 h-4 shrink-0" />}
            </button>

            {/* City Groups */}
            {Object.entries(branchesByCity).map(([city, cityBranches]) => (
              <div key={city} className="pt-1.5 space-y-1">
                <p className="px-3 pt-1 text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                  {city}
                </p>
                {cityBranches.map((branch) => {
                  const isSelected = selectedBranchId === branch.id;

                  return (
                    <button
                      key={branch.id}
                      onClick={() => {
                        setSelectedBranchId(branch.id);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer text-left ${
                        isSelected
                          ? 'bg-primary text-white font-semibold shadow-2xs'
                          : 'text-text-primary hover:bg-primary/5'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            branch.active ? 'bg-green-500' : 'bg-red-400'
                          }`}
                          title={branch.active ? 'Store Active' : 'Store Offline'}
                        />
                        <div className="truncate">
                          <p className="truncate leading-tight font-medium">
                            {branch.name}
                          </p>
                          <p
                            className={`text-[10px] truncate ${
                              isSelected ? 'text-white/80' : 'text-text-secondary'
                            }`}
                          >
                            {branch.address}
                          </p>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            ))}

            {filteredBranches.length === 0 && (
              <div className="py-6 text-center text-text-secondary text-xs">
                No matching outlets found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default BranchSwitcher;
