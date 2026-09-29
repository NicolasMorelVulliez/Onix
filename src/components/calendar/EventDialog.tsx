import { Clock, Loader2, MapPin, Pencil, Trash2, Video } from 'lucide-react'
import { useState } from 'react'
import { CATEGORIES } from '../../lib/calendar'
import type { CalendarEvent, CalendarSource } from '../../lib/types'
import { Dialog } from './Dialog'

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function formatRange(e: CalendarEvent) {
  if (e.all_day) {
    const d = (s: string) => new Date(`${s}T00:00`)
    const start = d(e.start)
    const last = new Date(d(e.end).getTime() - 86_400_000) // DTEND is exclusive for all-day events
    const fmt = (x: Date) => x.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
    return last > start ? `${fmt(start)} → ${fmt(last)}` : `${fmt(start)} · todo el día`
  }
  const s = new Date(e.start)
  const end = new Date(e.end)
  const day = s.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  const time = (x: Date) => x.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return `${day} · ${time(s)} – ${time(end)}`
}

export function EventDialog({
  event,
  source,
  onClose,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent
  source?: CalendarSource
  onClose: () => void
  /** Only Google events can be changed from Onix. */
  onEdit?: () => void
  onDelete?: () => Promise<void>
}) {
  const category = CATEGORIES.find((c) => c.id === source?.category)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog title={event.title} onClose={onClose}>
      <div className="space-y-2 text-sm">
        <p className="flex items-center gap-2">
          <Clock size={15} className="text-muted" /> {capitalize(formatRange(event))}
        </p>
        {event.meet_url && (
          <a
            href={event.meet_url}
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-2 rounded-md bg-accent px-3 py-1.5 font-medium text-accent-fg"
          >
            <Video size={15} /> Unirse con Google Meet
          </a>
        )}
        {event.location && (
          <p className="flex items-center gap-2">
            <MapPin size={15} className="text-muted" />
            {/^https?:\/\//.test(event.location) ? (
              <a href={event.location} target="_blank" rel="noreferrer" className="truncate text-accent hover:underline">
                {event.location}
              </a>
            ) : (
              event.location
            )}
          </p>
        )}
        {source && (
          <p className="flex items-center gap-2 text-muted">
            <span className="size-2.5 rounded-full" style={{ background: source.color }} />
            {source.name} · {category?.label}
          </p>
        )}
        {event.description && <p className="whitespace-pre-wrap border-t border-line pt-2 text-muted">{event.description}</p>}
        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        {(onEdit || onDelete) && (
          <div className="flex gap-2 border-t border-line pt-3">
            {onEdit && (
              <button type="button" onClick={onEdit} className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 hover:bg-hover">
                <Pencil size={14} /> Editar
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  if (!confirm(`¿Eliminar "${event.title}"? Si tiene invitados, les llega el aviso.`)) return
                  setDeleting(true)
                  try {
                    await onDelete()
                    onClose()
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e))
                    setDeleting(false)
                  }
                }}
                className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-red-600 hover:bg-hover dark:text-red-400"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Eliminar
              </button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
