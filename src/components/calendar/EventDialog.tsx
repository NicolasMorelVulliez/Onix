import { Clock, MapPin } from 'lucide-react'
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

export function EventDialog({ event, source, onClose }: { event: CalendarEvent; source?: CalendarSource; onClose: () => void }) {
  const category = CATEGORIES.find((c) => c.id === source?.category)
  return (
    <Dialog title={event.title} onClose={onClose}>
      <div className="space-y-2 text-sm">
        <p className="flex items-center gap-2">
          <Clock size={15} className="text-muted" /> {capitalize(formatRange(event))}
        </p>
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
      </div>
    </Dialog>
  )
}
