import { Menu } from 'lucide-react'
import type { ReactNode } from 'react'
import { useUI } from '../lib/ui-store'

export function TopBar({ children }: { children?: ReactNode }) {
  const setSidebarOpen = useUI((s) => s.setSidebarOpen)
  return (
    <div className="safe-top material sticky top-0 z-20 bg-(--topbar)">
      <div className="flex h-11 items-center gap-2 px-3">
        <button type="button" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)} className="rounded p-1 text-muted hover:bg-hover md:hidden">
          <Menu size={18} />
        </button>
        {children}
      </div>
    </div>
  )
}
