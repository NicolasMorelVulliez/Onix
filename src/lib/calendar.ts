import { create } from 'zustand'
import { db, getMeta, setMeta } from './db'
import { API_URL, auth } from './firebase'
import { fetchGoogleEvents, type GoogleCalendar } from './google'
import { parseIcs } from '../../shared/ics'
import { schedulePush } from './sync'
import type { CalendarCategory, CalendarSource, GoogleAccount } from './types'
import { now, uid } from './util'

export const CATEGORIES: { id: CalendarCategory; label: string; color: string }[] = [
  { id: 'laboral', label: 'Laboral (EGS)', color: '#2383e2' },
  { id: 'personal', label: 'Personal', color: '#448361' },
  { id: 'uade', label: 'UADE', color: '#9065b0' },
]

const STALE_MS = 15 * 60_000
const DAY = 86_400_000

/** Per-source fetch state (not synced: each device fetches on its own). */
export const useCalendarStatus = create<Record<string, { loading?: boolean; error?: string }>>(() => ({}))
const setStatus = (id: string, s: { loading?: boolean; error?: string }) =>
  useCalendarStatus.setState((all) => ({ ...all, [id]: s }))

async function saveSource(init: Partial<CalendarSource> & Pick<CalendarSource, 'name' | 'category'>) {
  const t = now()
  const source: CalendarSource = {
    id: uid(),
    created_at: t,
    updated_at: t,
    deleted_at: null,
    purged: 0,
    dirty: 1,
    provider: 'ics',
    url: '',
    color: CATEGORIES.find((c) => c.id === init.category)!.color,
    enabled: 1,
    ...init,
  }
  await db.calendar_sources.put(source)
  schedulePush()
  await refreshSource(source)
  return source
}

/** Adds an iCal link (Outlook / UADE…). */
export function addSource(init: Pick<CalendarSource, 'name' | 'url' | 'category'>) {
  return saveSource({ ...init, url: init.url.trim() })
}

/** Shows (or hides) one calendar of a linked Google account. */
export async function setGoogleCalendar(account: GoogleAccount, cal: GoogleCalendar, enabled: boolean) {
  const existing = await db.calendar_sources
    .filter((s) => s.account_id === account.id && s.calendar_id === cal.id && !s.deleted_at)
    .first()
  if (existing) {
    await updateSource(existing.id, { enabled: enabled ? 1 : 0 })
    if (enabled) refreshSource({ ...existing, enabled: 1 })
    else await db.events.where('source_id').equals(existing.id).delete()
    return
  }
  if (!enabled) return
  await saveSource({
    provider: 'google',
    name: cal.summary,
    account_id: account.id,
    calendar_id: cal.id,
    category: account.category,
    color: cal.backgroundColor ?? CATEGORIES.find((c) => c.id === account.category)!.color,
  })
}

export async function updateSource(id: string, changes: Partial<CalendarSource>) {
  await db.calendar_sources.update(id, { ...changes, updated_at: now(), dirty: 1 })
  schedulePush()
}

export async function removeSource(id: string) {
  await updateSource(id, { deleted_at: now(), purged: 1, url: '' })
  await db.events.where('source_id').equals(id).delete()
}

async function downloadIcs(url: string) {
  const token = await auth?.currentUser?.getIdToken()
  const res = await fetch(`${API_URL}/api/ics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Error ${res.status}`)
  return res.text()
}

/** Downloads the source's events and replaces its cached events (from 2 months ago to 1 year ahead). */
export async function refreshSource(source: CalendarSource) {
  setStatus(source.id, { loading: true })
  try {
    const t = Date.now()
    const from = new Date(t - 60 * DAY)
    const to = new Date(t + 365 * DAY)
    const events =
      source.provider === 'google'
        ? await fetchGoogleEvents(source.account_id!, source.calendar_id!, source.id, from, to)
        : parseIcs(await downloadIcs(source.url), source.id, from, to)
    await db.transaction('rw', db.events, async () => {
      await db.events.where('source_id').equals(source.id).delete()
      await db.events.bulkPut(events)
    })
    await setMeta(`fetched:${source.id}`, String(t))
    setStatus(source.id, {})
  } catch (e) {
    setStatus(source.id, { error: e instanceof Error ? e.message : String(e) })
  }
}

/** Refreshes every enabled source that is older than 15 minutes (or all, when forced). */
export async function refreshAll(force = false) {
  const sources = await db.calendar_sources.filter((s) => !s.deleted_at && !!s.enabled).toArray()
  // Events of removed/disabled sources (e.g. deleted from another device) are dropped.
  const keep = new Set(sources.map((s) => s.id))
  await db.events.filter((e) => !keep.has(e.source_id)).delete()
  await Promise.all(
    sources.map(async (s) => {
      const last = Number(await getMeta(`fetched:${s.id}`))
      if (force || !last || Date.now() - last > STALE_MS) await refreshSource(s)
    }),
  )
}
