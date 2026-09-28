import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Dialog({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-3 pt-[10vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-[34rem] max-w-full overflow-y-auto rounded-xl border border-line bg-bg p-4 shadow-2xl"
      >
        <div className="mb-3 flex items-start gap-2">
          <h2 className="flex-1 text-lg font-semibold">{title}</h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded p-1 text-muted hover:bg-hover">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
