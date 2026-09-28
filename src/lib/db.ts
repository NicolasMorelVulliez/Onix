import Dexie, { type EntityTable } from 'dexie'
import type { CalendarEvent, CalendarSource, Page, View } from './types'

interface Meta {
  key: string
  value: string
}

class AppDB extends Dexie {
  pages!: EntityTable<Page, 'id'>
  views!: EntityTable<View, 'id'>
  calendar_sources!: EntityTable<CalendarSource, 'id'>
  events!: EntityTable<CalendarEvent, 'id'>
  meta!: EntityTable<Meta, 'key'>

  constructor() {
    super('espacio')
    this.version(1).stores({
      pages: 'id, parent_id, database_id, dirty, updated_at, is_template',
      views: 'id, database_id, dirty',
      meta: 'key',
    })
    this.version(2).stores({
      calendar_sources: 'id, dirty',
      events: 'id, source_id, start',
    })
  }
}

export const db = new AppDB()

export const SYNCED_TABLES = ['pages', 'views', 'calendar_sources'] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]

export async function getMeta(key: string) {
  return (await db.meta.get(key))?.value ?? null
}

export async function setMeta(key: string, value: string) {
  await db.meta.put({ key, value })
}
