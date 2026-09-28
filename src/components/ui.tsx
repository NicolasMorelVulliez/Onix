import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/util'

/**
 * Floating panel anchored to a trigger element. Rendered in a portal with fixed
 * positioning so it isn't clipped by scroll containers (tables, boards).
 */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  className,
  align = 'start',
}: {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  align?: 'start' | 'end'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) return
    const a = anchor.getBoundingClientRect()
    const p = ref.current.getBoundingClientRect()
    let left = align === 'end' ? a.right - p.width : a.left
    left = Math.max(8, Math.min(left, window.innerWidth - p.width - 8))
    let top = a.bottom + 4
    if (top + p.height > window.innerHeight - 8) top = Math.max(8, a.top - p.height - 4)
    setPos({ top, left })
  }, [open, anchor, align])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, anchor, onClose])

  if (!open) return null
  return createPortal(
    <div
      ref={ref}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className={cx(
        'fixed z-50 max-h-[70vh] overflow-auto rounded-lg border border-line bg-bg p-1 text-sm shadow-xl shadow-black/10',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  )
}

export function MenuItem({
  children,
  onClick,
  icon,
  danger,
  active,
}: {
  children: ReactNode
  onClick?: () => void
  icon?: ReactNode
  danger?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-hover',
        danger && 'text-red-600 dark:text-red-400',
        active && 'bg-hover',
      )}
    >
      {icon && <span className="flex size-4 items-center justify-center text-muted">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
}

export function IconButton({
  children,
  onClick,
  title,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cx('flex size-6 items-center justify-center rounded text-muted hover:bg-hover', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Hook helper: state + anchor element for a popover. */
export function usePopover() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return {
    anchor,
    open: anchor !== null,
    toggle: (el: HTMLElement) => setAnchor((a) => (a ? null : el)),
    close: () => setAnchor(null),
  }
}

const EMOJIS =
  '📄 📝 📚 📓 📒 📌 📎 🗂️ 📁 📅 🗓️ ⏰ ✅ ☑️ 🎯 🚀 💡 🔥 ⭐ 💼 🏢 🎓 🏫 🧠 💻 🖥️ 📱 🛠️ ⚙️ 🧪 📊 📈 💰 🏦 🛒 🍽️ 🏋️ ⚽ 🎮 🎵 🎬 ✈️ 🏠 ❤️ 😀 🙂 🤓 🧘 🌱 🌎 ☕ 🐶 🐱'.split(' ')

export function EmojiPicker({ onPick, onRemove }: { onPick: (e: string) => void; onRemove?: () => void }) {
  return (
    <div className="w-72">
      <div className="grid grid-cols-8 gap-0.5 p-1">
        {EMOJIS.map((e) => (
          <button key={e} type="button" onClick={() => onPick(e)} className="rounded p-1 text-xl hover:bg-hover">
            {e}
          </button>
        ))}
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove} className="w-full rounded px-2 py-1.5 text-left text-muted hover:bg-hover">
          Quitar ícono
        </button>
      )}
    </div>
  )
}
