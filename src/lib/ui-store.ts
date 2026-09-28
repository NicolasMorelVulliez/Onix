import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  expanded: Record<string, boolean>
  /** Mobile drawer. */
  sidebarOpen: boolean
  searchOpen: boolean
  /** Last selected view per database. */
  activeView: Record<string, string>
  /** Calendar layers hidden with the filter chips (categories + 'tareas'). */
  hiddenLayers: string[]
  theme: 'notion' | 'apple'
  mode: 'system' | 'light' | 'dark'
  toggleExpanded: (id: string, value?: boolean) => void
  setSidebarOpen: (v: boolean) => void
  setSearchOpen: (v: boolean) => void
  setActiveView: (dbId: string, viewId: string) => void
  setHiddenLayers: (layers: string[]) => void
  setTheme: (theme: UIState['theme']) => void
  setMode: (mode: UIState['mode']) => void
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      expanded: {},
      sidebarOpen: false,
      searchOpen: false,
      activeView: {},
      hiddenLayers: [],
      theme: 'notion',
      mode: 'system',
      toggleExpanded: (id, value) => set((s) => ({ expanded: { ...s.expanded, [id]: value ?? !s.expanded[id] } })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setActiveView: (dbId, viewId) => set((s) => ({ activeView: { ...s.activeView, [dbId]: viewId } })),
      setHiddenLayers: (hiddenLayers) => set({ hiddenLayers }),
      setTheme: (theme) => set({ theme }),
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'onix-ui',
      partialize: (s) => ({
        expanded: s.expanded,
        activeView: s.activeView,
        hiddenLayers: s.hiddenLayers,
        theme: s.theme,
        mode: s.mode,
      }),
    },
  ),
)
