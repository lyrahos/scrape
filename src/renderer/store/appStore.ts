// ============================================================================
// Global Application State — Zustand store
// ============================================================================
import { create } from 'zustand';

export type NavPage = 'search' | 'state' | 'update' | 'analytics' | 'query' | 'settings';

interface AppState {
  // Navigation
  currentPage: NavPage;
  setPage: (page: NavPage) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: unknown[];
  setSearchResults: (results: unknown[]) => void;

  // Selected state
  selectedState: string;
  setSelectedState: (state: string) => void;

  // Loading states
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  loadingMessage: string;
  setLoadingMessage: (msg: string) => void;

  // Update
  isUpdating: boolean;
  setIsUpdating: (v: boolean) => void;
  updateProgress: { current: number; total: number; message: string } | null;
  setUpdateProgress: (p: { current: number; total: number; message: string } | null) => void;

  // Dashboard stats
  stats: {
    totalHospitals: number;
    totalRecords: number;
    activeFiles: number;
    updatesThisWeek: number;
  } | null;
  setStats: (s: AppState['stats']) => void;

  // Notifications
  notifications: { id: string; type: 'success' | 'error' | 'info'; message: string }[];
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  removeNotification: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'search',
  setPage: (page) => set({ currentPage: page }),

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  searchResults: [],
  setSearchResults: (results) => set({ searchResults: results }),

  selectedState: '',
  setSelectedState: (state) => set({ selectedState: state }),

  isLoading: false,
  setIsLoading: (v) => set({ isLoading: v }),
  loadingMessage: '',
  setLoadingMessage: (msg) => set({ loadingMessage: msg }),

  isUpdating: false,
  setIsUpdating: (v) => set({ isUpdating: v }),
  updateProgress: null,
  setUpdateProgress: (p) => set({ updateProgress: p }),

  stats: null,
  setStats: (s) => set({ stats: s }),

  notifications: [],
  addNotification: (type, message) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        { id: Date.now().toString(), type, message },
      ],
    })),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));
