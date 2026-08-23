import { create } from 'zustand';

interface AppState {
  selectedBranchId: string | null;
  setSelectedBranchId: (id: string | null) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedBranchId: null,
  setSelectedBranchId: (id) => set({ selectedBranchId: id }),
  sidebarOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
