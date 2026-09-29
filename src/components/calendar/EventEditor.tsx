import { useLiveQuery } from 'dexie-react-hooks'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { addDays, hm, ymd } from '../../lib/dates'
import { db } from '../../lib/db'
import { createEvent, eventGuests, updateEvent, type EventDraft } from '../../lib/gcal'
import type { CalendarEvent } from '../../lib/types'
import { Dialog } from './Dialog'

/** Initial values when creating: a slot picked in the calendar, or the next hour. */
export function draftForSlot(start?: Date, end?: Date, allDay = false): Omit<EventDraft, 'sourceId'> {
  const s = start ?? new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000)
  const e = end ?? new Date(s.getTime() + 3_600_000)
  return {
    title: '',
    allDay,
    date: ymd(s),
    start: hm(s),
    // FullCalendar's all-day selection end is exclusive.
    endDate: allDay ? addDays(ymd(e), -1) : ymd(e),
    end: hm(e),
    location: '',
    description: '',
    guests: '',
    meet: false,
  }
}

function draftForEvent(e: CalendarEvent): Omit<EventDraft, 'sourceId'> {
  if (e.all_day) {
    return { ...draftForSlot(), title: e.title, allDay: true, date: e.start, endDate: addDays(e.end, -1), location: e.location ?? '', description: e.description ?? '', meet: !!e.meet_url }
  }
  const s = new Date(e.start)
  const end = new Date(e.end)
  return { title: e.title, allDay: false, date: ymd(s), start: hm(s), endDate: ymd(end), end: hm(end), location: e.location ?? '', description: e.description ?? '', guests: '', meet: !!e.meet_url }
}

export function EventEditor({
  event,
  initial,
  onClose,
}: {
  /** Editing an existing Google event… */
  event?: CalendarEvent
  /** …or creating one with these values. */
  initial?: Omit<EventDraft, 'sourceId'>
  onClose: () => void
}) {
  const sources = useLiveQuery(() => db.calendar_sources.filter((s) => s.provider === 'google' && !s.deleted_at && !!s.enabled).toArray(), [])
  const accounts = useLiveQuery(() => db.google_accounts.toArray(), [])
  const [d, setD] = useState<EventDraft>({ sourceId: event?.source_id ?? '', ...(event ? draftForEvent(event) : (initial ?? draftForSlot())) })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (c: Partial<EventDraft>) => setD((cur) => ({ ...cur, ...c }))

  // Default calendar: the first primary-looking one.
  useEffect(() => {
    if (!d.sourceId && sources?.length) set({ sourceId: sources[0].id })
  }, [sources, d.sourceId])
  useEffect(() => {
    if (event) eventGuests(event).then((guests) => set({ guests })).catch(() => {})
  }, [event])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (event) await updateEvent(event, d)
      else await createEvent(d)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const field = 'w-full rounded-md border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent'
  const email = (accountId?: string | null) => accounts?.find((a) => a.id === accountId)?.email

  if (sources?.length === 0) {
    return (
      <Dialog title="Nuevo evento" onClose={onClose}>
        <p className="text-sm text-muted">Vinculá una cuenta de Google y activá al menos un calendario en Cuentas para crear eventos.</p>
      </Dialog>
    )
  }

  return (
    <Dialog title={event ? 'Editar evento' : 'Nuevo evento'} onClose={onClose}>
      <form onSubmit={save} className="space-y-2 text-sm">
        <input autoFocus required value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Título" className={`${field} text-base font-medium`} />
        <select value={d.sourceId} disabled={!!event} onChange={(e) => set({ sourceId: e.target.value })} className={field}>
          {sources?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {email(s.account_id)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={d.allDay} onChange={(e) => set({ allDay: e.target.checked })} /> Todo el día
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" required value={d.date} onChange={(e) => set({ date: e.target.value, endDate: e.target.value > d.endDate ? e.target.value : d.endDate })} className={`${field} w-auto`} />
          {!d.allDay && <input type="time" required value={d.start} onChange={(e) => set({ start: e.target.value })} className={`${field} w-auto`} />}
          <span className="text-muted">→</span>
          <input type="date" value={d.endDate} min={d.date} onChange={(e) => set({ endDate: e.target.value })} className={`${field} w-auto`} />
          {!d.allDay && <input type="time" required value={d.end} onChange={(e) => set({ end: e.target.value })} className={`${field} w-auto`} />}
        </div>
        <input value={d.location} onChange={(e) => set({ location: e.target.value })} placeholder="Ubicación" className={field} />
        <input value={d.guests} onChange={(e) => set({ guests: e.target.value })} placeholder="Invitados (emails separados por coma)" className={field} />
        <textarea value={d.description} onChange={(e) => set({ description: e.target.value })} rows={3} placeholder="Descripción" className={field} />
        {!(event?.meet_url) && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={d.meet} onChange={(e) => set({ meet: e.target.checked })} /> Agregar videollamada de Google Meet
          </label>
        )}
        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md border border-line px-3 py-1.5 hover:bg-hover">
            Cancelar
          </button>
          <button disabled={busy || !d.sourceId} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-accent-fg disabled:opacity-60">
            {busy && <Loader2 size={14} className="animate-spin" />} {event ? 'Guardar' : 'Crear evento'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
