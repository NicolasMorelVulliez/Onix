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
import { CalendarPlus, Link2, RefreshCw, Video } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CATEGORIES, refreshAll, useCalendarStatus } from '../../lib/calendar'
import { db } from '../../lib/db'
import type { CalendarEvent, DateValue } from '../../lib/types'
import { useColorScheme } from '../../lib/theme'
import { useUI } from '../../lib/ui-store'
import { cx } from '../../lib/util'
import { TopBar } from '../TopBar'
import { EventDialog } from './EventDialog'
import { MeetDialog } from './MeetDialog'
import { ClassDialog } from './ClassDialog'
import { useClassEvents, type ClassEvent } from '../../lib/classes'
import { draftForSlot, EventEditor } from './EventEditor'
import { deleteEvent, moveEvent } from '../../lib/gcal'
import { setRowProp } from '../../lib/pages'
import { ymd } from '../../lib/dates'
import type { EventDraft } from '../../lib/gcal'

const TASKS = { id: 'tareas', label: 'Tareas', color: '#787774' }
const LAYERS = [...CATEGORIES, TASKS]
const isMobile = () => window.matchMedia('(max-width: 767px)').matches

/** Rows of any database that have a date: they show up as tasks in the calendar. */
function useTasks() {
  return useLiveQuery(async () => {
    const dbs = await db.pages.filter((p) => p.kind === 'database' && !p.calendar_category && !p.deleted_at && !p.purged).toArray()
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
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const [meetOpen, setMeetOpen] = useState(false)
  const [editor, setEditor] = useState<{ event?: CalendarEvent; initial?: Omit<EventDraft, 'sourceId'> } | null>(null)
  const accounts = useLiveQuery(() => db.google_accounts.filter((a) => !a.deleted_at).toArray(), [])
  const status = useCalendarStatus()
  const loading = Object.values(status).some((s) => s.loading)

  const sources = useLiveQuery(() => db.calendar_sources.filter((s) => !s.deleted_at && !!s.enabled).toArray(), [])
  const events = useLiveQuery(() => db.events.toArray(), [])
  const tasks = useTasks()
  const classes = useClassEvents()
  const [selectedClass, setSelectedClass] = useState<ClassEvent | null>(null)

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
      return [
        {
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          allDay: !!e.all_day,
          color: s.color,
          editable: s.provider === 'google',
          extendedProps: { event: e },
        },
      ]
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
          editable: true,
          extendedProps: { pageId: t.id },
        }))
    const classEvents = (classes ?? [])
      .filter((c) => !hidden.includes(c.category))
      .map((c) => ({
        id: c.page.id,
        title: c.subject ? `${c.subject.title} · ${c.page.title}` : c.page.title,
        start: c.start,
        end: c.end,
        allDay: c.start.length === 10,
        color: CATEGORIES.find((x) => x.id === c.category)?.color,
        editable: true,
        extendedProps: { pageId: c.page.id, classEv: c },
      }))
    return [...external, ...own, ...classEvents]
  }, [events, sources, tasks, classes, hidden])

  /** Drag & drop / resize: moves Google events and task dates. */
  const onMove = async (ev: { start: Date | null; end: Date | null; allDay: boolean; extendedProps: Record<string, unknown> }, revert: () => void) => {
    const start = ev.start!
    const end = ev.end ?? new Date(start.getTime() + (ev.allDay ? 86_400_000 : 3_600_000))
    try {
      const { event, pageId } = ev.extendedProps as { event?: CalendarEvent; pageId?: string }
      if (event) await moveEvent(event, start, end, ev.allDay)
      else if (pageId) {
        const page = await db.pages.get(pageId)
        const database = page?.database_id ? await db.pages.get(page.database_id) : undefined
        const prop = database?.schema?.find((p) => p.type === 'date')
        if (!prop) return revert()
        await setRowProp(pageId, prop.id, ev.allDay ? { start: ymd(start) } : { start: start.toISOString(), end: end.toISOString() })
      }
    } catch (e) {
      revert()
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const toggle = (id: string) => setHidden(hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id])

  return (
    <>
      <TopBar>
        <span className="text-sm">Calendario</span>
      </TopBar>
      <div className="px-8 pb-10 max-md:px-2">
        <div className="mb-3 mt-4 flex flex-wrap items-center gap-2 max-md:px-2">
          <h1 className="mr-2 page-title text-3xl font-bold max-md:w-full max-md:text-2xl">Calendario</h1>
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
            {!!accounts?.length && (
              <button
                type="button"
                onClick={() => setEditor({ initial: draftForSlot() })}
                className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-sm hover:bg-hover"
              >
                <CalendarPlus size={14} /> Nuevo evento
              </button>
            )}
            {!!accounts?.length && (
              <button
                type="button"
                onClick={() => setMeetOpen(true)}
                className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-sm font-medium text-accent-fg"
              >
                <Video size={14} /> Nuevo Meet
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate({ to: '/accounts' })}
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
            onClick={() => navigate({ to: '/accounts' })}
            className="mb-3 w-full rounded-md border border-dashed border-line p-3 text-left text-sm text-muted hover:bg-hover"
          >
            Todavía no vinculaste calendarios. Tocá acá para conectar tus cuentas de Google (EGS, personal) y el link de UADE (Outlook).
          </button>
        )}

        <div className="onix-calendar">
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
            selectable={!!accounts?.length}
            select={(info) => setEditor({ initial: draftForSlot(info.start, info.end, info.allDay) })}
            eventDrop={(info) => onMove(info.event, info.revert)}
            eventResize={(info) => onMove(info.event, info.revert)}
            eventClick={(info) => {
              const { pageId, event, classEv } = info.event.extendedProps as { pageId?: string; event?: CalendarEvent; classEv?: ClassEvent }
              if (classEv) setSelectedClass(classEv)
              else if (pageId) navigate({ to: '/p/$pageId', params: { pageId } })
              else if (event) setSelected(event)
            }}
          />
        </div>
      </div>
      {meetOpen && accounts && <MeetDialog accounts={accounts} onClose={() => setMeetOpen(false)} />}
      {selected && (
        <EventDialog
          event={selected}
          source={sources?.find((s) => s.id === selected.source_id)}
          onClose={() => setSelected(null)}
          {...(sources?.find((s) => s.id === selected.source_id)?.provider === 'google'
            ? { onEdit: () => (setEditor({ event: selected }), setSelected(null)), onDelete: () => deleteEvent(selected) }
            : {})}
        />
      )}
      {selectedClass && <ClassDialog ev={selectedClass} onClose={() => setSelectedClass(null)} />}
      {editor && <EventEditor event={editor.event} initial={editor.initial} onClose={() => setEditor(null)} />}
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
