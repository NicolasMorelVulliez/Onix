import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { CalendarCategory, DateValue, Page } from './types'

/** A row of a database shown in the calendar as an event (e.g. a class of a subject). */
export interface ClassEvent {
  page: Page
  database: Page
  /** The page the database lives in (the subject), if any. */
  subject?: Page
  category: CalendarCategory
  start: string
  end?: string
  topic?: string
  prep?: string
  kind?: string
}

export async function loadClassEvents(): Promise<ClassEvent[]> {
  const dbs = await db.pages.filter((p) => p.kind === 'database' && !!p.calendar_category && !p.deleted_at && !p.purged).toArray()
  if (!dbs.length) return []
  const subjects = new Map((await db.pages.bulkGet(dbs.map((d) => d.parent_id ?? ''))).filter(Boolean).map((p) => [p!.id, p!]))
  const byId = new Map(dbs.map((d) => [d.id, d]))
  const rows = await db.pages
    .where('database_id')
    .anyOf([...byId.keys()])
    .filter((r) => !r.deleted_at && !r.purged)
    .toArray()
  return rows.flatMap((r) => {
    const database = byId.get(r.database_id!)!
    const prop = (name: string) => database.schema?.find((p) => p.name === name)
    const date = database.schema?.find((p) => p.type === 'date')
    const v = date ? (r.props[date.id] as DateValue | null) : null
    if (!v?.start) return []
    const text = (name: string) => {
      const p = prop(name)
      return p ? (r.props[p.id] as string | undefined) : undefined
    }
    return [
      {
        page: r,
        database,
        subject: subjects.get(database.parent_id ?? ''),
        category: database.calendar_category!,
        start: v.start,
        end: v.end,
        topic: text('Tema'),
        prep: text('Para preparar'),
        kind: text('Tipo'),
      },
    ]
  })
}

export function useClassEvents() {
  return useLiveQuery(loadClassEvents, [])
}
