import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  expanded: Record<string, boolean>
  /** Mobile drawer. */
  sidebarOpen: boolean
  searchOpen: boolean
  /** Last selected view per database. */
  activeView: Record<string, string>
  toggleExpanded: (id: string, value?: boolean) => void
  setSidebarOpen: (v: boolean) => void
  setSearchOpen: (v: boolean) => void
  setActiveView: (dbId: string, viewId: string) => void
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      expanded: {},
      sidebarOpen: false,
      searchOpen: false,
      activeView: {},
      toggleExpanded: (id, value) => set((s) => ({ expanded: { ...s.expanded, [id]: value ?? !s.expanded[id] } })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setActiveView: (dbId, viewId) => set((s) => ({ activeView: { ...s.activeView, [dbId]: viewId } })),
    }),
    {
      name: 'espacio-ui',
      partialize: (s) => ({ expanded: s.expanded, activeView: s.activeView }),
    },
  ),
)
