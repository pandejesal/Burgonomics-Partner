import React, { useState } from 'react';
import { X, Plus, Trash2, Sparkles, Utensils, CheckCircle2, Layers } from 'lucide-react';
import type { MenuItem } from '@/types';

interface ComboBuilderDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  availableItems: MenuItem[];
  onCreateCombo: (comboData: {
    name: string;
    description: string;
    price: number;
    originalPrice: number;
    burgerIds: string[];
    sideIds: string[];
    drinkIds: string[];
  }) => Promise<void>;
  loading?: boolean;
}

export function ComboBuilderDrawer({
  isOpen,
  onClose,
  availableItems,
  onCreateCombo,
  loading = false,
}: ComboBuilderDrawerProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [comboPrice, setComboPrice] = useState<number>(349);
  const [selectedBurgerId, setSelectedBurgerId] = useState<string>('');
  const [selectedSideId, setSelectedSideId] = useState<string>('');
  const [selectedDrinkId, setSelectedDrinkId] = useState<string>('');

  if (!isOpen) return null;

  const burgers = availableItems.filter(
    (i) =>
      i.categoryId?.toLowerCase().includes('burger') ||
      i.category?.toLowerCase().includes('burger')
  );
  const sides = availableItems.filter(
    (i) =>
      i.categoryId?.toLowerCase().includes('side') ||
      i.categoryId?.toLowerCase().includes('fries') ||
      i.category?.toLowerCase().includes('side')
  );
  const drinks = availableItems.filter(
    (i) =>
      i.categoryId?.toLowerCase().includes('beverage') ||
      i.categoryId?.toLowerCase().includes('shake') ||
      i.category?.toLowerCase().includes('drink')
  );

  const selectedBurger = availableItems.find((i) => i.id === selectedBurgerId);
  const selectedSide = availableItems.find((i) => i.id === selectedSideId);
  const selectedDrink = availableItems.find((i) => i.id === selectedDrinkId);

  const originalPrice =
    (selectedBurger?.price || 0) + (selectedSide?.price || 0) + (selectedDrink?.price || 0);

  const savings = Math.max(0, originalPrice - comboPrice);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !selectedBurgerId) return;

    await onCreateCombo({
      name,
      description,
      price: comboPrice,
      originalPrice,
      burgerIds: [selectedBurgerId],
      sideIds: selectedSideId ? [selectedSideId] : [],
      drinkIds: selectedDrinkId ? [selectedDrinkId] : [],
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-[#112415] border-l border-[#1E3A24] text-white shadow-2xl flex flex-col justify-between">
          {/* Header */}
          <div className="p-5 bg-[#0A0A0A] border-b border-[#1E3A24] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#0E4825] border border-[#4ADE80]/30 flex items-center justify-center">
                <Layers className="w-4 h-4 text-[#4ADE80]" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white">Dynamic Combo Meal Builder</h2>
                <p className="text-[11px] text-zinc-400">Bundle burger + side + beverage with deal pricing</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Form */}
          <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-zinc-300">Combo Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Classic Smash Value Meal"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ADE80]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-zinc-300">Description</label>
              <textarea
                rows={2}
                placeholder="Includes Classic Smash Burger, Cajun Fries & Beverage"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#4ADE80]"
              />
            </div>

            {/* Burger Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-zinc-300">
                1. Select Hero Burger <span className="text-[#FF6600]">*</span>
              </label>
              <select
                required
                value={selectedBurgerId}
                onChange={(e) => setSelectedBurgerId(e.target.value)}
                className="w-full px-3 py-2 bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-xs text-white focus:outline-none focus:border-[#4ADE80]"
              >
                <option value="">-- Choose Burger --</option>
                {burgers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} (₹{b.price})
                  </option>
                ))}
              </select>
            </div>

            {/* Side Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-zinc-300">2. Select Side (Optional)</label>
              <select
                value={selectedSideId}
                onChange={(e) => setSelectedSideId(e.target.value)}
                className="w-full px-3 py-2 bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-xs text-white focus:outline-none focus:border-[#4ADE80]"
              >
                <option value="">-- Choose Side (Fries/Dips) --</option>
                {sides.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (₹{s.price})
                  </option>
                ))}
              </select>
            </div>

            {/* Beverage Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-zinc-300">3. Select Drink / Shake (Optional)</label>
              <select
                value={selectedDrinkId}
                onChange={(e) => setSelectedDrinkId(e.target.value)}
                className="w-full px-3 py-2 bg-[#0A0A0A] border border-[#1E3A24] rounded-xl text-xs text-white focus:outline-none focus:border-[#4ADE80]"
              >
                <option value="">-- Choose Beverage --</option>
                {drinks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} (₹{d.price})
                  </option>
                ))}
              </select>
            </div>

            {/* Pricing Breakdown Card */}
            <div className="p-4 bg-[#0A0A0A] rounded-xl border border-[#1E3A24] space-y-2">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Ala Carte Total:</span>
                <span className="font-mono line-through">₹{originalPrice}</span>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#4ADE80]">Combo Special Price (₹):</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={comboPrice}
                  onChange={(e) => setComboPrice(Number(e.target.value))}
                  className="w-24 px-2 py-1 bg-[#112415] border border-[#4ADE80]/50 rounded-lg text-xs font-bold text-white text-right font-mono focus:outline-none"
                />
              </div>
              {savings > 0 && (
                <div className="flex justify-between text-[11px] text-[#FF6600] font-bold pt-1 border-t border-[#1E3A24]">
                  <span>Customer Savings:</span>
                  <span>Save ₹{savings} ({Math.round((savings / (originalPrice || 1)) * 100)}% OFF)</span>
                </div>
              )}
            </div>
          </form>

          {/* Footer */}
          <div className="p-5 bg-[#0A0A0A] border-t border-[#1E3A24] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#112415] text-zinc-300 hover:text-white rounded-xl text-xs font-bold border border-[#1E3A24] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !name.trim() || !selectedBurgerId}
              className="px-4 py-2 bg-[#0E4825] hover:bg-[#155e32] text-white rounded-xl text-xs font-bold border border-[#4ADE80]/30 transition-colors shadow-md disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{loading ? 'Creating...' : 'Publish Combo Deal'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
