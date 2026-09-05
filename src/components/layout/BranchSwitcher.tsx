import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useBranches } from '@/hooks/useBranches';
import { useAppStore } from '@/stores/appStore';
import { Building2, ChevronDown, Check, Search, Store, Globe, MapPin } from 'lucide-react';

export function BranchSwitcher() {
  const { user } = useAuthStore();
  const { branches } = useBranches();
  const { selectedCity, setSelectedCity, selectedBranchId, setSelectedBranchId } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isGlobalRole =
    user?.role === 'brand_owner' ||
    user?.role === 'developer' ||
    user?.role === 'support' ||
    user?.role === 'regional_manager';

  const cities = useMemo(() => {
    const set = new Set<string>();
    branches.forEach((b) => {
      if (b.city) set.add(b.city);
    });
    return Array.from(set);
  }, [branches]);

  const activeBranch = useMemo(() => {
    if (!selectedBranchId || selectedBranchId === 'all') return null;
    return branches.find((b) => b.id === selectedBranchId) || null;
  }, [branches, selectedBranchId]);

  // Scoped roles (branch_owner AND branch_staff) get a locked badge — the
  // global outlet picker must never render for sessions limited to assigned
  // branches. Queries additionally clamp any persisted selection server-side
  // of trust (see resolveScopedBranchIds).
  if (!isGlobalRole) {
    return (
      <div className="flex items-center space-x-2 px-3 py-1.5 bg-surface border border-border rounded-xl text-xs text-white">
        <Store className="w-3.5 h-3.5 text-accent-light" />
        <span className="font-semibold">{user?.branchIds?.[0] ? 'My Outlet' : 'Branch Scope'}</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex min-w-0 max-w-[42vw] sm:max-w-none items-center space-x-2 px-3 py-1.5 bg-surface hover:bg-[#1A351F] border border-border rounded-xl text-xs text-white transition-colors cursor-pointer"
      >
        {activeBranch ? (
          <>
            <Store className="w-3.5 h-3.5 shrink-0 text-accent-light" />
            <span className="font-semibold truncate max-w-[110px] sm:max-w-[140px]">{activeBranch.name}</span>
          </>
        ) : selectedCity !== 'all' ? (
          <>
            <MapPin className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            <span className="font-semibold truncate">City: {selectedCity}</span>
          </>
        ) : (
          <>
            <Globe className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            <span className="font-semibold truncate">All Outlets</span>
          </>
        )}
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-72 bg-surface border border-border rounded-2xl shadow-2xl z-50 overflow-hidden text-xs text-white">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Filter outlets or cities..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-bg border border-border rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto p-1.5 space-y-1 divide-y divide-[#1E3A24]">
            {/* All Outlets Option */}
            <button
              onClick={() => {
                setSelectedCity('all');
                setSelectedBranchId(null);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors text-left ${
                selectedCity === 'all' && !selectedBranchId ? 'bg-surface-hover text-accent-light font-bold' : 'text-zinc-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-emerald-400" />
                <span>All Outlets (Total Brand)</span>
              </div>
              {selectedCity === 'all' && !selectedBranchId && <Check className="w-4 h-4" />}
            </button>

            {/* City Options */}
            <div className="pt-1">
              <div className="px-3 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                Filter by City
              </div>
              {cities.map((city) => (
                <button
                  key={city}
                  onClick={() => {
                    setSelectedCity(city);
                    setSelectedBranchId(null);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-surface-hover transition-colors text-left ${
                    selectedCity === city && !selectedBranchId ? 'bg-surface-hover text-emerald-400 font-bold' : 'text-zinc-300'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{city} (All Outlets)</span>
                  </div>
                  {selectedCity === city && !selectedBranchId && <Check className="w-4 h-4" />}
                </button>
              ))}
            </div>

            {/* Specific Branches */}
            <div className="pt-1">
              <div className="px-3 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                Specific Outlet
              </div>
              {branches
                .filter((b) => !search || b.name.toLowerCase().includes(search.toLowerCase()))
                .map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setSelectedCity(b.city);
                      setSelectedBranchId(b.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-surface-hover transition-colors text-left ${
                      selectedBranchId === b.id ? 'bg-surface-hover text-accent-light font-bold' : 'text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Store className="w-3.5 h-3.5 text-accent-light" />
                      <div className="truncate">
                        <div>{b.name}</div>
                        <div className="text-[10px] text-zinc-500">{b.city}</div>
                      </div>
                    </div>
                    {selectedBranchId === b.id && <Check className="w-4 h-4" />}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
