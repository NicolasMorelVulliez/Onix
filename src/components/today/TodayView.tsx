import { useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarClock, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Plus, Repeat } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { refreshAll } from '../../lib/calendar'
import { addDays, dayOf, hm, isTimed, longDay, todayYmd, ymd } from '../../lib/dates'
import { db } from '../../lib/db'
import { addTask, scheduleTask, setTaskDone, taskMinutes, unscheduleTask, useTasks, type Task } from '../../lib/tasks'
import type { CalendarEvent } from '../../lib/types'
import { cx } from '../../lib/util'
import { EventDialog } from '../calendar/EventDialog'
import { TopBar } from '../TopBar'
import { MenuItem, Popover, usePopover } from '../ui'

const START_H = 6
const END_H = 24
const PX_MIN = 1 // 60px per hour
const SNAP = 15
const DURATIONS = [15, 30, 45, 60, 90, 120, 180]
const SLOTS = Array.from({ length: (END_H - START_H) * 2 }, (_, i) => `${String(START_H + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)

interface Block {
  id: string
  start: number // minutes since midnight
  end: number
  title: string
  color: string
  event?: CalendarEvent
  task?: Task
}

const minutesOf = (iso: string) => {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/** Side-by-side columns for overlapping blocks. */
function layout(blocks: Block[]) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end)
  const out: (Block & { col: number; cols: number })[] = []
  let cluster: (Block & { col: number; cols: number })[] = []
  let clusterEnd = -1
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((b) => b.col + 1))
    cluster.forEach((b) => (b.cols = cols))
    out.push(...cluster)
    cluster = []
  }
  for (const b of sorted) {
    if (b.start >= clusterEnd) flush()
    const used = new Set(cluster.filter((c) => c.end > b.start).map((c) => c.col))
    let col = 0
    while (used.has(col)) col++
    cluster.push({ ...b, col, cols: 1 })
    clusterEnd = Math.max(clusterEnd, b.end)
  }
  flush()
  return out
}

export function TodayView() {
  const [day, setDay] = useState(todayYmd())
  const navigate = useNavigate()
  const tasks = useTasks()
  const sources = useLiveQuery(() => db.calendar_sources.filter((s) => !s.deleted_at && !!s.enabled).toArray(), [])
  const events = useLiveQuery(() => db.events.toArray(), [])
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [showUndated, setShowUndated] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    refreshAll()
  }, [])

  const colorOf = useMemo(() => new Map(sources?.map((s) => [s.id, s.color])), [sources])

  const { allDay, blocks } = useMemo(() => {
    const allDay: { id: string; title: string; color: string; event: CalendarEvent }[] = []
    const blocks: Block[] = []
    for (const e of events ?? []) {
      const color = colorOf.get(e.source_id)
      if (!color) continue
      if (e.all_day) {
        if (e.start <= day && day < e.end) allDay.push({ id: e.id, title: e.title, color, event: e })
      } else if (dayOf(e.start) === day || (dayOf(e.start) < day && dayOf(e.end) >= day)) {
        const start = dayOf(e.start) === day ? minutesOf(e.start) : 0
        const end = dayOf(e.end) === day ? minutesOf(e.end) : 24 * 60
        blocks.push({ id: e.id, start, end: Math.max(end, start + 15), title: e.title, color, event: e })
      }
    }
    for (const t of tasks ?? []) {
      if (!t.date || !isTimed(t.date.start) || dayOf(t.date.start) !== day) continue
      const start = minutesOf(t.date.start)
      blocks.push({ id: t.page.id, start, end: start + taskMinutes(t), title: t.page.title || 'Sin título', color: 'var(--accent)', task: t })
    }
    return { allDay, blocks: layout(blocks) }
  }, [events, tasks, colorOf, day])

  const lists = useMemo(() => {
    const open = (tasks ?? []).filter((t) => !t.done)
    const byDay = (t: Task) => (t.date ? dayOf(t.date.start) : null)
    return {
      overdue: day === todayYmd() ? open.filter((t) => byDay(t) && byDay(t)! < day) : [],
      today: open.filter((t) => byDay(t) === day && !isTimed(t.date!.start)),
      scheduled: open.filter((t) => byDay(t) === day && isTimed(t.date!.start)),
      undated: open.filter((t) => !t.date && t.dateProp),
      done: (tasks ?? []).filter((t) => t.done && byDay(t) === day),
    }
  }, [tasks, day])

  const openPage = (id: string) => navigate({ to: '/p/$pageId', params: { pageId: id } })
  const isToday = day === todayYmd()
  const counts = `${blocks.filter((b) => b.event).length + allDay.length} eventos · ${lists.today.length + lists.scheduled.length} tareas`

  return (
    <>
      <TopBar>
        <span className="text-sm">Mi día</span>
      </TopBar>
      <div className="px-8 pb-10 pt-4 max-md:px-3">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h1 className="page-title text-3xl font-bold max-md:text-2xl">{isToday ? 'Hoy' : longDay(day)}</h1>
            <p className="text-sm text-muted">
              {isToday && `${longDay(day)} · `}
              {counts}
            </p>
          </div>
          <button type="button" aria-label="Día anterior" onClick={() => setDay(addDays(day, -1))} className="rounded-md border border-line p-1.5 hover:bg-hover">
            <ChevronLeft size={16} />
          </button>
          <button type="button" disabled={isToday} onClick={() => setDay(todayYmd())} className="rounded-md border border-line px-2.5 py-1 text-sm hover:bg-hover disabled:opacity-50">
            Hoy
          </button>
          <button type="button" aria-label="Día siguiente" onClick={() => setDay(addDays(day, 1))} className="rounded-md border border-line p-1.5 hover:bg-hover">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex gap-6 max-md:flex-col-reverse">
          <Timeline day={day} allDay={allDay} blocks={blocks} tasks={tasks ?? []} onEvent={setSelectedEvent} onOpenTask={openPage} />

          <aside className="w-80 flex-none space-y-5 text-sm max-md:w-full">
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!draft.trim()) return
                await addTask(draft.trim(), day)
                setDraft('')
              }}
              className="flex items-center gap-2 rounded-md border border-line px-2 focus-within:border-accent"
            >
              <Plus size={15} className="text-muted" />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={isToday ? 'Agregar tarea para hoy…' : 'Agregar tarea para este día…'}
                className="min-w-0 flex-1 bg-transparent py-2 outline-none"
              />
            </form>

            {lists.overdue.length > 0 && <TaskGroup title="Vencidas" tone="text-red-600 dark:text-red-400" tasks={lists.overdue} day={day} onOpen={openPage} />}
            <TaskGroup title={isToday ? 'Para hoy' : 'Para este día'} tasks={lists.today} day={day} onOpen={openPage} empty="Nada pendiente. Arrastrá tareas al horario para agendarlas." />
            {lists.scheduled.length > 0 && <TaskGroup title="Agendadas" tasks={lists.scheduled} day={day} onOpen={openPage} />}

            <div>
              <button type="button" onClick={() => setShowUndated(!showUndated)} className="mb-1 flex items-center gap-1 text-xs font-medium text-muted">
                <ChevronDown size={14} className={cx('transition-transform', !showUndated && '-rotate-90')} /> Sin fecha ({lists.undated.length})
              </button>
              {showUndated && <TaskList tasks={lists.undated} day={day} onOpen={openPage} />}
            </div>
            {lists.done.length > 0 && <TaskGroup title="Hechas" tasks={lists.done} day={day} onOpen={openPage} />}
          </aside>
        </div>
      </div>
      {selectedEvent && (
        <EventDialog event={selectedEvent} source={sources?.find((s) => s.id === selectedEvent.source_id)} onClose={() => setSelectedEvent(null)} />
      )}
    </>
  )
}

function TaskGroup({ title, tasks, day, onOpen, tone, empty }: { title: string; tasks: Task[]; day: string; onOpen: (id: string) => void; tone?: string; empty?: string }) {
  return (
    <div>
      <div className={cx('mb-1 text-xs font-medium text-muted', tone)}>
        {title} {tasks.length > 0 && `(${tasks.length})`}
      </div>
      {tasks.length === 0 && empty ? <p className="text-xs text-muted">{empty}</p> : <TaskList tasks={tasks} day={day} onOpen={onOpen} />}
    </div>
  )
}

function TaskList({ tasks, day, onOpen }: { tasks: Task[]; day: string; onOpen: (id: string) => void }) {
  return (
    <ul className="space-y-0.5">
      {tasks.map((t) => (
        <TaskRow key={t.page.id} task={t} day={day} onOpen={onOpen} />
      ))}
    </ul>
  )
}

function TaskRow({ task, day, onOpen }: { task: Task; day: string; onOpen: (id: string) => void }) {
  const pop = usePopover()
  const [time, setTime] = useState('09:00')
  const [minutes, setMinutes] = useState(taskMinutes(task))
  const timed = task.date && isTimed(task.date.start)
  return (
    <li
      draggable={!!task.dateProp}
      onDragStart={(e) => e.dataTransfer.setData('text/task', task.page.id)}
      className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-hover"
    >
      <DoneBox task={task} />
      <button type="button" onClick={() => onOpen(task.page.id)} className={cx('min-w-0 flex-1 truncate text-left', task.done && 'text-muted line-through')}>
        {task.page.icon} {task.page.title || 'Sin título'}
      </button>
      {task.page.repeat && <Repeat size={12} className="flex-none text-muted" />}
      {timed && <span className="flex-none text-xs text-muted">{hm(new Date(task.date!.start))}</span>}
      <span className="flex-none text-xs text-muted max-md:hidden">{task.database.title}</span>
      {task.dateProp && !task.done && (
        <button type="button" title="Agendar" onClick={(e) => pop.toggle(e.currentTarget)} className="flex-none rounded p-0.5 text-muted opacity-0 hover:bg-hover group-hover:opacity-100 max-md:opacity-100">
          <CalendarClock size={14} />
        </button>
      )}
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} align="end" className="w-56 p-2">
        <div className="mb-2 text-xs text-muted">Agendar en {day === todayYmd() ? 'hoy' : longDay(day)}</div>
        <div className="mb-2 flex gap-2">
          <select value={time} onChange={(e) => setTime(e.target.value)} className="flex-1 rounded border border-line bg-bg px-1 py-1">
            {SLOTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="rounded border border-line bg-bg px-1 py-1">
            {DURATIONS.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            pop.close()
            scheduleTask(task, day, time, minutes)
          }}
          className="w-full rounded-md bg-accent py-1.5 font-medium text-accent-fg"
        >
          Agendar
        </button>
      </Popover>
    </li>
  )
}

function DoneBox({ task }: { task: Task }) {
  if (!task.statusProp) return <span className="size-4 flex-none" />
  return (
    <button
      type="button"
      title={task.done ? 'Marcar como pendiente' : 'Marcar como hecha'}
      onClick={() => setTaskDone(task, !task.done)}
      className={cx(
        'flex size-4 flex-none items-center justify-center rounded-full border',
        task.done ? 'border-accent bg-accent text-accent-fg' : 'border-(--muted) hover:border-accent',
      )}
    >
      {task.done && <Check size={11} strokeWidth={3} />}
    </button>
  )
}

function Timeline({
  day,
  allDay,
  blocks,
  tasks,
  onEvent,
  onOpenTask,
}: {
  day: string
  allDay: { id: string; title: string; color: string; event: CalendarEvent }[]
  blocks: (Block & { col: number; cols: number })[]
  tasks: Task[]
  onEvent: (e: CalendarEvent) => void
  onOpenTask: (id: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [ghost, setGhost] = useState<number | null>(null)
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  // Start the view around the current time.
  useEffect(() => {
    const m = now.getHours() * 60 + now.getMinutes()
    scroller.current?.scrollTo({ top: Math.max(0, (m - START_H * 60 - 90) * PX_MIN) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day])

  const minuteAt = (clientY: number) => {
    const rect = scroller.current!.getBoundingClientRect()
    const y = clientY - rect.top + scroller.current!.scrollTop
    const m = START_H * 60 + y / PX_MIN
    return Math.max(START_H * 60, Math.min(END_H * 60 - SNAP, Math.round(m / SNAP) * SNAP))
  }
  const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const nowMin = now.getHours() * 60 + now.getMinutes()

  return (
    <section className="min-w-0 flex-1">
      {allDay.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {allDay.map((e) => (
            <button key={e.id} type="button" onClick={() => onEvent(e.event)} className="rounded px-2 py-0.5 text-xs font-medium text-white" style={{ background: e.color }}>
              {e.title}
            </button>
          ))}
        </div>
      )}
      <div
        ref={scroller}
        className="relative h-[70vh] overflow-y-auto rounded-lg border border-line max-md:h-[60vh]"
        onDragOver={(e) => {
          e.preventDefault()
          setGhost(minuteAt(e.clientY))
        }}
        onDragLeave={() => setGhost(null)}
        onDrop={(e) => {
          e.preventDefault()
          setGhost(null)
          const task = tasks.find((t) => t.page.id === e.dataTransfer.getData('text/task'))
          if (task) scheduleTask(task, day, toTime(minuteAt(e.clientY)), taskMinutes(task))
        }}
      >
        <div className="relative" style={{ height: (END_H - START_H) * 60 * PX_MIN }}>
          {Array.from({ length: END_H - START_H }, (_, i) => (
            <div key={i} className="absolute inset-x-0 border-t border-line" style={{ top: i * 60 * PX_MIN }}>
              <span className="absolute -top-2 left-1 bg-bg px-1 text-[10px] text-muted">{String(START_H + i).padStart(2, '0')}:00</span>
            </div>
          ))}
          {ghost !== null && (
            <div className="absolute left-12 right-2 rounded-md border-2 border-dashed border-accent bg-accent/10 text-xs text-accent" style={{ top: (ghost - START_H * 60) * PX_MIN, height: 30 * PX_MIN }}>
              <span className="px-1">{toTime(ghost)}</span>
            </div>
          )}
          {blocks.map((b) => (
            <TimelineBlock key={b.id} block={b} onEvent={onEvent} onOpenTask={onOpenTask} />
          ))}
          {day === ymd(now) && nowMin >= START_H * 60 && (
            <div className="pointer-events-none absolute left-10 right-0 z-10 flex items-center" style={{ top: (nowMin - START_H * 60) * PX_MIN }}>
              <span className="size-2 rounded-full bg-red-500" />
              <span className="h-px flex-1 bg-red-500" />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function TimelineBlock({ block: b, onEvent, onOpenTask }: { block: Block & { col: number; cols: number }; onEvent: (e: CalendarEvent) => void; onOpenTask: (id: string) => void }) {
  const pop = usePopover()
  const top = (Math.max(b.start, START_H * 60) - START_H * 60) * PX_MIN
  const height = Math.max(18, (b.end - Math.max(b.start, START_H * 60)) * PX_MIN - 2)
  const left = `calc(3rem + (100% - 3.5rem) * ${b.col / b.cols})`
  const width = `calc((100% - 3.5rem) / ${b.cols} - 2px)`
  const task = b.task
  return (
    <>
      <div
        draggable={!!task}
        onDragStart={(e) => task && e.dataTransfer.setData('text/task', task.page.id)}
        onClick={(e) => (task ? pop.toggle(e.currentTarget) : onEvent(b.event!))}
        className={cx(
          'absolute cursor-pointer overflow-hidden rounded-md px-1.5 py-0.5 text-xs leading-tight',
          task ? 'border-l-4 border-accent bg-accent/15 text-fg' : 'text-white',
          task?.done && 'opacity-50 line-through',
        )}
        style={{ top, height, left, width, background: task ? undefined : b.color }}
      >
        <span className="font-medium">{b.title}</span>
        {height > 30 && (
          <span className="block opacity-80">
            <Clock size={10} className="mr-0.5 inline" />
            {`${String(Math.floor(b.start / 60)).padStart(2, '0')}:${String(b.start % 60).padStart(2, '0')}`}
          </span>
        )}
      </div>
      {task && (
        <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} className="w-52">
          <MenuItem onClick={() => (pop.close(), setTaskDone(task, !task.done))}>{task.done ? 'Marcar pendiente' : 'Marcar como hecha'}</MenuItem>
          <MenuItem onClick={() => (pop.close(), onOpenTask(task.page.id))}>Abrir</MenuItem>
          <div className="px-2 pt-1 text-xs text-muted">Duración</div>
          <div className="flex flex-wrap gap-1 px-2 pb-1">
            {DURATIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  pop.close()
                  const d = new Date(task.date!.start)
                  scheduleTask(task, ymd(d), hm(d), m)
                }}
                className={cx('rounded px-1.5 py-0.5 text-xs', taskMinutes(task) === m ? 'bg-accent text-accent-fg' : 'bg-hover')}
              >
                {m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
          </div>
          <MenuItem onClick={() => (pop.close(), unscheduleTask(task))}>Quitar del horario</MenuItem>
        </Popover>
      )}
    </>
  )
}
