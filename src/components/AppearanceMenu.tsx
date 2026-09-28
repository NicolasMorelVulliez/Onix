import { Monitor, Moon, Palette, Sun } from 'lucide-react'
import { useUI } from '../lib/ui-store'
import { cx } from '../lib/util'
import { Popover, usePopover } from './ui'

const THEMES = [
  { id: 'notion', label: 'Notion', note: 'Cálido y plano', swatch: ['#f7f7f5', '#37352f', '#2383e2'] },
  { id: 'apple', label: 'Apple', note: 'Translúcido, SF', swatch: ['#f2f2f7', '#000000', '#007aff'] },
] as const

const MODES = [
  { id: 'system', label: 'Sistema', icon: Monitor },
  { id: 'light', label: 'Claro', icon: Sun },
  { id: 'dark', label: 'Oscuro', icon: Moon },
] as const

export function AppearanceMenu() {
  const pop = usePopover()
  const { theme, mode, setTheme, setMode } = useUI()
  return (
    <>
      <button
        type="button"
        onClick={(e) => pop.toggle(e.currentTarget)}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-muted hover:bg-hover"
      >
        <Palette size={16} /> Apariencia
      </button>
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} className="w-64 p-2">
        <div className="mb-1 px-1 text-xs font-medium text-muted">Tema</div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={cx(
                'rounded-lg border p-2 text-left',
                theme === t.id ? 'border-accent ring-1 ring-accent' : 'border-line hover:bg-hover',
              )}
            >
              <span className="mb-1.5 flex h-8 overflow-hidden rounded-md border border-line">
                <span className="w-1/3" style={{ background: t.swatch[0] }} />
                <span className="flex flex-1 flex-col justify-center gap-1 bg-white px-1.5">
                  <span className="h-1 w-3/4 rounded-full" style={{ background: t.swatch[1] }} />
                  <span className="h-1 w-1/2 rounded-full" style={{ background: t.swatch[2] }} />
                </span>
              </span>
              <span className="block text-sm font-medium">{t.label}</span>
              <span className="block text-xs text-muted">{t.note}</span>
            </button>
          ))}
        </div>
        <div className="mb-1 px-1 text-xs font-medium text-muted">Modo</div>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-hover p-0.5">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={cx(
                'flex flex-col items-center gap-0.5 rounded-md py-1.5 text-xs',
                mode === id ? 'bg-bg font-medium text-fg shadow-sm' : 'text-muted',
              )}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </Popover>
    </>
  )
}
