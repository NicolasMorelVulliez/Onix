import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import interactionPlugin from '@fullcalendar/react/interaction'
import listPlugin from '@fullcalendar/react/list'
import esLocale from '@fullcalendar/react/locales/es'
import '@fullcalendar/react/skeleton.css'
import classicThemePlugin from '@fullcalendar/react/themes/classic'
import '@fullcalendar/react/themes/classic/palette.css'
import '@fullcalendar/react/themes/classic/theme.css'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import { useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link2, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CATEGORIES, refreshAll, useCalendarStatus } from '../../lib/calendar'
import { db } from '../../lib/db'
import type { CalendarEvent, DateValue } from '../../lib/types'
import { useColorScheme } from '../../lib/useColorScheme'
import { useUI } from '../../lib/ui-store'
import { cx } from '../../lib/util'
import { TopBar } from '../TopBar'
import { AccountsDialog } from './AccountsDialog'
import { EventDialog } from './EventDialog'

const TASKS = { id: 'tareas', label: 'Tareas', color: '#787774' }
const LAYERS = [...CATEGORIES, TASKS]
const isMobile = () => window.matchMedia('(max-width: 767px)').matches

/** Rows of any database that have a date: they show up as tasks in the calendar. */
function useTasks() {
  return useLiveQuery(async () => {
    const dbs = await db.pages.filter((p) => p.kind === 'database' && !p.deleted_at && !p.purged).toArray()
    const dateProp = new Map<string, string>()
    for (const d of dbs) {
      const prop = d.schema?.find((p) => p.type === 'date')
      if (prop) dateProp.set(d.id, prop.id)
    }
    const rows = await db.pages
      .where('database_id')
      .anyOf([...dateProp.keys()])
      .filter((r) => !r.deleted_at && !r.purged && !r.is_template)
      .toArray()
    return rows.flatMap((r) => {
      const v = r.props[dateProp.get(r.database_id!)!] as DateValue | null
      if (!v?.start) return []
      return [{ id: r.id, title: r.title || 'Sin título', start: v.start, end: v.end, icon: r.icon }]
    })
  }, [])
}

export function CalendarView() {
  const scheme = useColorScheme()
  const navigate = useNavigate()
  const hidden = useUI((s) => s.hiddenLayers)
  const setHidden = useUI((s) => s.setHiddenLayers)
  const [accountsOpen, setAccountsOpen] = useState(false)
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const status = useCalendarStatus()
  const loading = Object.values(status).some((s) => s.loading)

  const sources = useLiveQuery(() => db.calendar_sources.filter((s) => !s.deleted_at && !!s.enabled).toArray(), [])
  const events = useLiveQuery(() => db.events.toArray(), [])
  const tasks = useTasks()

  useEffect(() => {
    refreshAll()
    const t = setInterval(() => refreshAll(), 15 * 60_000)
    return () => clearInterval(t)
  }, [])

  const fcEvents = useMemo(() => {
    const byId = new Map(sources?.map((s) => [s.id, s]))
    const external = (events ?? []).flatMap((e) => {
      const s = byId.get(e.source_id)
      if (!s || hidden.includes(s.category)) return []
      return [{ id: e.id, title: e.title, start: e.start, end: e.end, allDay: !!e.all_day, color: s.color, extendedProps: { event: e } }]
    })
    const own = hidden.includes(TASKS.id)
      ? []
      : (tasks ?? []).map((t) => ({
          id: t.id,
          title: `${t.icon ?? '☑'} ${t.title}`,
          start: t.start,
          end: t.end,
          allDay: t.start.length === 10,
          color: TASKS.color,
          extendedProps: { pageId: t.id },
        }))
    return [...external, ...own]
  }, [events, sources, tasks, hidden])

  const toggle = (id: string) => setHidden(hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id])

  return (
    <>
      <TopBar>
        <span className="text-sm">Calendario</span>
      </TopBar>
      <div className="px-8 pb-10 max-md:px-2">
        <div className="mb-3 mt-4 flex flex-wrap items-center gap-2 max-md:px-2">
          <h1 className="mr-2 text-3xl font-bold max-md:w-full max-md:text-2xl">Calendario</h1>
          <Chip active={hidden.length === 0} onClick={() => setHidden([])}>
            Todo
          </Chip>
          {LAYERS.map((l) => (
            <Chip key={l.id} active={!hidden.includes(l.id)} color={l.color} onClick={() => toggle(l.id)}>
              {l.label}
            </Chip>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              title="Actualizar calendarios"
              onClick={() => refreshAll(true)}
              className="rounded p-1.5 text-muted hover:bg-hover"
            >
              <RefreshCw size={16} className={cx(loading && 'animate-spin')} />
            </button>
            <button
              type="button"
              onClick={() => setAccountsOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-sm hover:bg-hover"
            >
              <Link2 size={14} /> Cuentas
              {sources?.length === 0 && <span className="size-2 rounded-full bg-accent" />}
            </button>
          </div>
        </div>

        {sources?.length === 0 && (
          <button
            type="button"
            onClick={() => setAccountsOpen(true)}
            className="mb-3 w-full rounded-md border border-dashed border-line p-3 text-left text-sm text-muted hover:bg-hover"
          >
            Todavía no vinculaste calendarios. Tocá acá para conectar EGS (Google), tu calendario personal y UADE (Outlook).
          </button>
        )}

        <div className="espacio-calendar">
          <FullCalendar
            plugins={[classicThemePlugin, dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            locale={esLocale}
            colorScheme={scheme}
            initialView={isMobile() ? 'listWeek' : 'timeGridWeek'}
            headerToolbar={
              isMobile()
                ? { start: 'prev,next today', center: '', end: 'listWeek,timeGridDay,dayGridMonth' }
                : { start: 'prev,next today', center: 'title', end: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' }
            }
            height="auto"
            nowIndicator
            dayMaxEvents
            slotMinTime="07:00:00"
            scrollTime="08:00:00"
            events={fcEvents}
            eventClick={(info) => {
              const { pageId, event } = info.event.extendedProps as { pageId?: string; event?: CalendarEvent }
              if (pageId) navigate({ to: '/p/$pageId', params: { pageId } })
              else if (event) setSelected(event)
            }}
          />
        </div>
      </div>
      {accountsOpen && <AccountsDialog onClose={() => setAccountsOpen(false)} />}
      {selected && <EventDialog event={selected} source={sources?.find((s) => s.id === selected.source_id)} onClose={() => setSelected(null)} />}
    </>
  )
}

function Chip({ active, color, onClick, children }: { active: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm transition-colors',
        active ? 'border-transparent bg-hover text-fg' : 'border-line text-muted line-through decoration-1',
      )}
    >
      {color && <span className="size-2.5 rounded-full" style={{ background: color, opacity: active ? 1 : 0.4 }} />}
      {children}
    </button>
  )
}
