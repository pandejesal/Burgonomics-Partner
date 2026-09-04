import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  selectedCity: string;
  setSelectedCity: (city: string) => void;
  selectedBranchId: string | null;
  setSelectedBranchId: (id: string | null) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedCity: 'all',
      setSelectedCity: (city) => set({ selectedCity: city }),
      selectedBranchId: null,
      setSelectedBranchId: (id) => set({ selectedBranchId: id }),
      sidebarOpen: false,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
    }),
    {
      name: 'burgonomics-partner-app-storage',
      partialize: (state) => ({
        selectedCity: state.selectedCity,
        selectedBranchId: state.selectedBranchId,
      }),
    }
  )
);

