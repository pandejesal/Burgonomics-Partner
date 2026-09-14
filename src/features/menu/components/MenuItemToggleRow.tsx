import React from 'react';
import { Eye, EyeOff, Sparkles, Clock, AlertTriangle } from 'lucide-react';
import type { MenuItem } from '@/types';

interface MenuItemToggleRowProps {
  item: MenuItem;
  canEdit: boolean;
  onToggleStock: (item: MenuItem) => void;
  disabledUntilText?: string;
}

export function MenuItemToggleRow({
  item,
  canEdit,
  onToggleStock,
  disabledUntilText,
}: MenuItemToggleRowProps) {
  const isAvailable = item.isAvailable ?? item.inStock ?? true;

  return (
    <div
      className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
        isAvailable
          ? 'bg-[#112415] border-[#1E3A24] hover:border-[#4ADE80]/40'
          : 'bg-[#161616] border-amber-900/40 opacity-85'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Veg / Non-Veg Indicator Icon */}
        <div
          className={`w-4 h-4 rounded-sm border-2 flex items-center justify-center shrink-0 ${
            item.isVeg !== false
              ? 'border-emerald-500 bg-emerald-950/40'
              : 'border-rose-500 bg-rose-950/40'
          }`}
        >
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              item.isVeg !== false ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
          />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-white">{item.name}</h4>
            {item.isJain && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-800 font-mono uppercase">
                Jain Option
              </span>
            )}
            {item.isBestSeller && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#0E4825] text-[#4ADE80] border border-[#4ADE80]/30 flex items-center gap-0.5">
                <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                <span>Bestseller</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400">
            <span className="font-mono font-bold text-zinc-200">₹{item.price}</span>
            <span>•</span>
            <span>{item.category || item.categoryId || 'Catalog Item'}</span>
            {!isAvailable && disabledUntilText && (
              <>
                <span>•</span>
                <span className="text-amber-400 text-[10px] flex items-center gap-1 font-medium">
                  <Clock className="w-3 h-3" />
                  <span>{disabledUntilText}</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-[#1E3A24]">
        {/* Status Badge */}
        <span
          className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 ${
            isAvailable
              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
              : 'bg-amber-950 text-amber-300 border border-amber-800'
          }`}
        >
          {isAvailable ? (
            <>
              <Eye className="w-3 h-3" />
              <span>In Stock (Active)</span>
            </>
          ) : (
            <>
              <EyeOff className="w-3 h-3" />
              <span>86ed (Unavailable)</span>
            </>
          )}
        </span>

        {/* Toggle Switch */}
        {canEdit ? (
          <button
            type="button"
            onClick={() => onToggleStock(item)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isAvailable ? 'bg-[#4ADE80]' : 'bg-zinc-700'
            }`}
            role="switch"
            aria-checked={isAvailable}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-black shadow ring-0 transition duration-200 ease-in-out ${
                isAvailable ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        ) : (
          <span className="text-[10px] text-zinc-500 font-mono">Read Only</span>
        )}
      </div>
    </div>
  );
}
