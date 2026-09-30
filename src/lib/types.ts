import type { Block } from '@blocknote/core'

export type PropertyType =
  | 'text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'status'
  | 'date'
  | 'checkbox'
  | 'url'

export type OptionColor = 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red'

export interface SelectOption {
  id: string
  name: string
  color: OptionColor
}

export interface Property {
  id: string
  name: string
  type: PropertyType
  options?: SelectOption[]
}

/** Date property value: ISO date (yyyy-mm-dd) or datetime, optional end. */
export interface DateValue {
  start: string
  end?: string
}

export type PropValue = string | number | boolean | string[] | DateValue | null

/** Fields every synced record has. */
export interface Syncable {
  id: string
  created_at: string
  /** Client time of the last edit, used for last-write-wins. */
  updated_at: string
  /** Soft delete (trash). */
  deleted_at: string | null
  /** Permanently deleted: kept as a tombstone so other devices learn about it. */
  purged: 0 | 1
  /** Local only: 1 while the change hasn't been pushed. */
  dirty?: 0 | 1
}

export interface Page extends Syncable {
  parent_id: string | null
  /** Set when this page is a row of a database. */
  database_id: string | null
  sort_key: string
  title: string
  icon: string | null
  kind: 'page' | 'database'
  content: Block[] | null
  /** Only for kind === 'database'. */
  schema: Property[] | null
  /** Only for database rows: propertyId -> value. */
  props: Record<string, PropValue>
  is_template: 0 | 1
  /** Recurring task: when marked done, its date moves to the next occurrence. */
  repeat?: RepeatRule | null
  /** Linked Google Drive folder: its files (and recordings) show inside the page. */
  drive?: DriveLink | null
  /** Databases only: rows are calendar events of this category (e.g. classes), not tasks. */
  calendar_category?: CalendarCategory | null
}

export interface DriveLink {
  accountId: string
  folderId: string
  name: string
}

export interface RepeatRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  /** Every N days/weeks/months/years. */
  interval: number
  /** Weekly only: 0 = Sunday … 6 = Saturday. */
  weekdays?: number[]
}

export type ViewType = 'table' | 'board'

export type FilterOp = 'contains' | 'is' | 'is_not' | 'is_empty' | 'not_empty' | 'checked' | 'unchecked'

export interface Filter {
  id: string
  prop: string // property id or 'title'
  op: FilterOp
  value?: string
}

export interface Sort {
  prop: string
  dir: 'asc' | 'desc'
}

export interface View extends Syncable {
  database_id: string
  name: string
  type: ViewType
  sort_key: string
  group_by: string | null
  filters: Filter[]
  sorts: Sort[]
  hidden: string[]
}

export type CalendarCategory = 'laboral' | 'personal' | 'uade'

/** A linked calendar: a Google Calendar of a linked account, or an iCal link (Outlook…). Synced. */
export interface CalendarSource extends Syncable {
  provider?: 'ics' | 'google' // missing = 'ics' (older rows)
  name: string
  /** iCal link (provider 'ics'). */
  url: string
  /** Linked Google account and calendar (provider 'google'). */
  account_id?: string | null
  calendar_id?: string | null
  category: CalendarCategory
  color: string
  enabled: 0 | 1
}

/** A linked Google account (Calendar + Drive). id = Google account id ("sub"). Synced. */
export interface GoogleAccount extends Syncable {
  email: string
  name: string
  picture: string
  /** Refresh token encrypted by the server; only the server can use it. */
  token: string
  /** Category given to its calendars when they're added. */
  category: CalendarCategory
  /** Set when Google revoked access and the account must be linked again. */
  needs_reauth?: 0 | 1
  /** Space-separated OAuth scopes granted (missing on accounts linked before Gmail). */
  scopes?: string
}

/** Local cache of events fetched from a CalendarSource (each device fetches its own). */
export interface CalendarEvent {
  id: string
  source_id: string
  title: string
  /** yyyy-mm-dd for all-day events, ISO datetime otherwise. */
  start: string
  end: string
  all_day: 0 | 1
  location: string | null
  description: string | null
  /** Google Meet link, when the event has one. */
  meet_url?: string | null
}

/** A synced app setting, e.g. id "notifications". */
export interface AppSetting<T = unknown> extends Syncable {
  value: T
}
