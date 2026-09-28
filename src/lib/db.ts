import Dexie, { type EntityTable } from 'dexie'
import type { CalendarEvent, CalendarSource, GoogleAccount, Page, View } from './types'

interface Meta {
  key: string
  value: string
}

class AppDB extends Dexie {
  pages!: EntityTable<Page, 'id'>
  views!: EntityTable<View, 'id'>
  calendar_sources!: EntityTable<CalendarSource, 'id'>
  events!: EntityTable<CalendarEvent, 'id'>
  google_accounts!: EntityTable<GoogleAccount, 'id'>
  meta!: EntityTable<Meta, 'key'>

  constructor() {
    super('onix')
    this.version(1).stores({
      pages: 'id, parent_id, database_id, dirty, updated_at, is_template',
      views: 'id, database_id, dirty',
      meta: 'key',
    })
    this.version(2).stores({
      calendar_sources: 'id, dirty',
      events: 'id, source_id, start',
    })
    this.version(3).stores({ google_accounts: 'id, dirty' })
  }
}

export const db = new AppDB()

export const SYNCED_TABLES = ['pages', 'views', 'calendar_sources', 'google_accounts'] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]

export async function getMeta(key: string) {
  return (await db.meta.get(key))?.value ?? null
}

export async function setMeta(key: string, value: string) {
  await db.meta.put({ key, value })
}
