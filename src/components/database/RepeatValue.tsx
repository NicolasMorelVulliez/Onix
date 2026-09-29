import { Repeat } from 'lucide-react'
import { describeRepeat } from '../../lib/repeat'
import { updatePage } from '../../lib/pages'
import type { Page, RepeatRule } from '../../lib/types'
import { cx } from '../../lib/util'
import { Popover, usePopover } from '../ui'

const FREQS: { id: RepeatRule['freq']; label: string; unit: string }[] = [
  { id: 'daily', label: 'Diaria', unit: 'días' },
  { id: 'weekly', label: 'Semanal', unit: 'semanas' },
  { id: 'monthly', label: 'Mensual', unit: 'meses' },
  { id: 'yearly', label: 'Anual', unit: 'años' },
]
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

/** "Repetir" row of a task: when it is marked done, its date moves to the next occurrence. */
export function RepeatValue({ row }: { row: Page }) {
  const pop = usePopover()
  const rule = row.repeat ?? null
  const set = (repeat: RepeatRule | null) => updatePage(row.id, { repeat })
  const patch = (c: Partial<RepeatRule>) => set({ freq: 'weekly', interval: 1, ...rule, ...c })

  return (
    <>
      <button type="button" onClick={(e) => pop.toggle(e.currentTarget)} className={cx('flex h-8 w-full items-center gap-1.5 px-2 text-left', !rule && 'text-muted')}>
        {rule ? describeRepeat(rule) : 'No se repite'}
      </button>
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} className="w-72 space-y-2 p-2">
        <div className="flex flex-wrap gap-1 text-xs">
          <button type="button" onClick={() => set(null)} className={cx("rounded px-2 py-1", !rule ? "bg-accent text-accent-fg" : "bg-hover")}>
            No
          </button>
          {FREQS.map((f) => (
            <button key={f.id} type="button" onClick={() => patch({ freq: f.id })} className={cx("rounded px-2 py-1", rule?.freq === f.id ? "bg-accent text-accent-fg" : "bg-hover")}>
              {f.label}
            </button>
          ))}
        </div>
        {rule && (
          <>
            <label className="flex items-center gap-2 text-sm">
              Cada
              <input
                type="number"
                min={1}
                max={99}
                value={rule.interval}
                onChange={(e) => patch({ interval: Math.max(1, Number(e.target.value) || 1) })}
                className="w-14 rounded border border-line bg-bg px-1 py-0.5"
              />
              {FREQS.find((f) => f.id === rule.freq)!.unit}
            </label>
            {rule.freq === 'weekly' && (
              <div className="flex gap-1">
                {DAY_ORDER.map((d) => {
                  const on = rule.weekdays?.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => patch({ weekdays: on ? rule.weekdays!.filter((x) => x !== d) : [...(rule.weekdays ?? []), d] })}
                      className={cx('size-7 rounded-full text-xs font-medium', on ? 'bg-accent text-accent-fg' : 'bg-hover text-muted')}
                    >
                      {DAY_LABELS[d]}
                    </button>
                  )
                })}
              </div>
            )}
            <p className="flex items-start gap-1 text-xs text-muted">
              <Repeat size={12} className="mt-0.5 flex-none" /> Al marcarla como hecha, pasa sola a la próxima fecha.
            </p>
          </>
        )}
      </Popover>
    </>
  )
}
