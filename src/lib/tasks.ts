import { useLiveQuery } from 'dexie-react-hooks'
import { combine, dayOf, isTimed } from './dates'
import { isDoneOption } from './repeat'
import { db } from './db'
import { createDatabase, createPage, setRowProp } from './pages'
import type { DateValue, Page, Property } from './types'

/** A database row seen as a task: it has a date and/or a status. */
export interface Task {
  page: Page
  database: Page
  dateProp?: Property
  statusProp?: Property
  date: DateValue | null
  done: boolean
}

export { isDoneOption }

const doneOption = (prop: Property) => prop.options?.find((o) => isDoneOption(prop, o.id))
const openOption = (prop: Property) => prop.options?.find((o) => !isDoneOption(prop, o.id))

const taskProps = (database: Page) => ({
  dateProp: database.schema?.find((p) => p.type === 'date'),
  statusProp: database.schema?.find((p) => p.type === 'status') ?? database.schema?.find((p) => p.type === 'checkbox'),
})

export function toTask(page: Page, database: Page): Task {
  const { dateProp, statusProp } = taskProps(database)
  const status = statusProp ? page.props[statusProp.id] : undefined
  return {
    page,
    database,
    dateProp,
    statusProp,
    date: dateProp ? ((page.props[dateProp.id] as DateValue | null) ?? null) : null,
    done: statusProp?.type === 'checkbox' ? status === true : isDoneOption(statusProp, status),
  }
}

/** Every task of every database that has a date or a status property. */
export function useTasks() {
  return useLiveQuery(async () => {
    const dbs = await db.pages.filter((p) => p.kind === 'database' && !p.deleted_at && !p.purged).toArray()
    const withTasks = dbs.filter((d) => {
      const { dateProp, statusProp } = taskProps(d)
      return dateProp || statusProp
    })
    const byId = new Map(withTasks.map((d) => [d.id, d]))
    const rows = await db.pages
      .where('database_id')
      .anyOf([...byId.keys()])
      .filter((r) => !r.deleted_at && !r.purged && !r.is_template)
      .toArray()
    return rows.map((r) => toTask(r, byId.get(r.database_id!)!))
  }, [])
}

export async function setTaskDone(task: Task, done: boolean) {
  const prop = task.statusProp
  if (!prop) return
  if (prop.type === 'checkbox') return setRowProp(task.page.id, prop.id, done)
  const option = done ? doneOption(prop) : openOption(prop)
  if (option) await setRowProp(task.page.id, prop.id, option.id)
}

/** Puts the task on the timeline: `date` at `time` for `minutes`. */
export async function scheduleTask(task: Task, date: string, time: string, minutes: number) {
  if (!task.dateProp) return
  const start = combine(date, time)
  const end = new Date(new Date(start).getTime() + minutes * 60_000).toISOString()
  await setRowProp(task.page.id, task.dateProp.id, { start, end })
}

/** Takes the task off the timeline but keeps its day. */
export async function unscheduleTask(task: Task) {
  if (!task.dateProp || !task.date) return
  await setRowProp(task.page.id, task.dateProp.id, { start: dayOf(task.date.start) })
}

export function taskMinutes(task: Task) {
  const v = task.date
  if (!v || !isTimed(v.start) || !v.end || !isTimed(v.end)) return 30
  return Math.max(15, Math.round((new Date(v.end).getTime() - new Date(v.start).getTime()) / 60_000))
}

/** The database where new tasks go: one named "Tareas", else the first with a date and a status. */
export async function taskDatabase(): Promise<Page> {
  const dbs = await db.pages.filter((p) => p.kind === 'database' && !p.deleted_at && !p.purged).toArray()
  const usable = dbs.filter((d) => taskProps(d).dateProp && taskProps(d).statusProp)
  const found = usable.find((d) => /^tareas?$/i.test(d.title.trim())) ?? usable[0]
  if (found) return found
  return createDatabase({ title: 'Tareas', icon: '✅' })
}

export async function addTask(title: string, day?: string) {
  const database = await taskDatabase()
  const { dateProp, statusProp } = taskProps(database)
  const props: Page['props'] = {}
  if (dateProp && day) props[dateProp.id] = { start: day }
  if (statusProp?.type === 'status') {
    const open = openOption(statusProp)
    if (open) props[statusProp.id] = open.id
  }
  return createPage({ database_id: database.id, parent_id: null, props, title })
}

