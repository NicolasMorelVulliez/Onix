import { useLiveQuery } from 'dexie-react-hooks'
import { AlertCircle, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { addSource, CATEGORIES, refreshSource, removeSource, updateSource, useCalendarStatus } from '../../lib/calendar'
import { db } from '../../lib/db'
import type { CalendarCategory } from '../../lib/types'
import { cx } from '../../lib/util'
import { Dialog } from './Dialog'

const GUIDES = {
  google: {
    label: 'Google Calendar (EGS / personal)',
    steps: [
      'Abrí calendar.google.com en la compu con la cuenta que querés vincular.',
      'Configuración (⚙️) → en la izquierda, elegí el calendario debajo de "Configuración de mis calendarios".',
      'Bajá hasta "Integrar el calendario" y copiá la "Dirección secreta en formato iCal".',
    ],
    note: 'Si en EGS no aparece esa opción, el administrador de Google Workspace la desactivó. Alternativa: compartí el calendario de EGS con tu cuenta personal y vinculá desde ahí.',
  },
  outlook: {
    label: 'Outlook / Office 365 (UADE)',
    steps: [
      'Entrá a outlook.office.com con tu cuenta de UADE.',
      'Configuración (⚙️) → Calendario → Calendarios compartidos → "Publicar un calendario".',
      'Elegí el calendario, permisos "Puede ver todos los detalles", tocá Publicar y copiá el link ICS.',
    ],
    note: 'Si UADE no permite publicar, como ya lo cargás en Google Calendar, podés vincular ese calendario de Google y ponerle la categoría UADE.',
  },
}

export function AccountsDialog({ onClose }: { onClose: () => void }) {
  const sources = useLiveQuery(() => db.calendar_sources.filter((s) => !s.deleted_at).toArray(), [])
  const status = useCalendarStatus()
  const [guide, setGuide] = useState<keyof typeof GUIDES>('google')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState<CalendarCategory>('laboral')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setBusy(true)
    await addSource({ name: name.trim() || CATEGORIES.find((c) => c.id === category)!.label, url, category })
    setBusy(false)
    setName('')
    setUrl('')
  }

  return (
    <Dialog title="Cuentas vinculadas" onClose={onClose}>
      <div className="space-y-2">
        {sources?.length === 0 && <p className="text-sm text-muted">Todavía no hay calendarios vinculados.</p>}
        {sources?.map((s) => {
          const st = status[s.id] ?? {}
          return (
            <div key={s.id} className="rounded-md border border-line p-2 text-sm">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={s.color}
                  title="Color"
                  onChange={(e) => updateSource(s.id, { color: e.target.value })}
                  className="size-5 flex-none cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <input
                  defaultValue={s.name}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && updateSource(s.id, { name: e.target.value.trim() })}
                  className="min-w-0 flex-1 bg-transparent font-medium outline-none"
                />
                <select
                  value={s.category}
                  onChange={(e) => updateSource(s.id, { category: e.target.value as CalendarCategory })}
                  className="rounded border border-line bg-bg px-1 py-0.5 text-xs"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-muted" title="Mostrar en el calendario">
                  <input
                    type="checkbox"
                    checked={!!s.enabled}
                    onChange={async (e) => {
                      await updateSource(s.id, { enabled: e.target.checked ? 1 : 0 })
                      if (e.target.checked) refreshSource({ ...s, enabled: 1 })
                      else db.events.where('source_id').equals(s.id).delete()
                    }}
                  />
                </label>
                <button type="button" title="Actualizar" onClick={() => refreshSource(s)} className="rounded p-1 text-muted hover:bg-hover">
                  {st.loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </button>
                <button
                  type="button"
                  title="Desvincular"
                  onClick={() => confirm(`¿Desvincular "${s.name}"?`) && removeSource(s.id)}
                  className="rounded p-1 text-muted hover:bg-hover"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {st.error && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle size={12} /> {st.error}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <form onSubmit={submit} className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
        <h3 className="font-medium">Vincular un calendario</h3>
        <div className="flex gap-1">
          {(Object.keys(GUIDES) as (keyof typeof GUIDES)[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setGuide(k)
                setCategory(k === 'outlook' ? 'uade' : 'laboral')
              }}
              className={cx('rounded-md px-2 py-1', guide === k ? 'bg-hover font-medium' : 'text-muted hover:bg-hover')}
            >
              {GUIDES[k].label}
            </button>
          ))}
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          {GUIDES[guide].steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="text-xs text-muted">{GUIDES[guide].note}</p>
        <input
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Pegá el link .ics (https://… o webcal://…)"
          className="w-full rounded-md border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent"
        />
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre (ej. EGS)"
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CalendarCategory)}
            className="rounded-md border border-line bg-bg px-2"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <button disabled={busy} className="w-full rounded-md bg-accent py-2 font-medium text-white disabled:opacity-60">
          {busy ? 'Vinculando…' : 'Vincular'}
        </button>
        <p className="text-xs text-muted">
          El link es privado: se guarda solo en tu cuenta. Los eventos se actualizan cada 15 minutos (solo lectura).
        </p>
      </form>
    </Dialog>
  )
}
