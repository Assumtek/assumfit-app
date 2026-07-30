import { create } from 'zustand';

type UiState = {
  sidebarOpen: boolean;
  /** Rota ativa, alimentada pelo NavigationContainer para a sidebar destacar o item. */
  currentRoute: string | null;
  openSidebar: () => void;
  closeSidebar: () => void;
  setCurrentRoute: (route: string | null) => void;
};

/** Estado da sidebar. Fica fora da navegação porque o menu é um overlay. */
export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  currentRoute: null,
  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),
  setCurrentRoute: (currentRoute) => set({ currentRoute }),
}));
