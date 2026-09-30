import Dexie, { type EntityTable } from 'dexie'
import type { InkDoc, InkStrokes } from './ink/types'
import type { AppSetting, CalendarEvent, CalendarSource, GoogleAccount, Page, View } from './types'

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
  settings!: EntityTable<AppSetting, 'id'>
  /** Handwriting documents: cached PDFs and pending uploads (local only, the PDF in Drive is the copy). */
  ink!: EntityTable<InkDoc, 'id'>
  ink_strokes!: EntityTable<InkStrokes, 'id'>
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
    this.version(4).stores({ settings: 'id, dirty' })
    this.version(5).stores({ ink: 'id, file_id, source_id, folder_id, dirty', ink_strokes: 'id, doc_id' })
  }
}

export const db = new AppDB()

export const SYNCED_TABLES = ['pages', 'views', 'calendar_sources', 'google_accounts', 'settings'] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]

export async function getMeta(key: string) {
  return (await db.meta.get(key))?.value ?? null
}

export async function setMeta(key: string, value: string) {
  await db.meta.put({ key, value })
}
