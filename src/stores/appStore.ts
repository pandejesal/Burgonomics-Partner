import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  selectedBranchId: string | null;
  setSelectedBranchId: (id: string | null) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedBranchId: null,
      setSelectedBranchId: (id) => set({ selectedBranchId: id }),
      sidebarOpen: false,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
    }),
    {
      name: 'burgonomics-partner-app-storage',
      partialize: (state) => ({ selectedBranchId: state.selectedBranchId }),
    }
  )
);
