/** Builds a user's upcoming agenda on the server: Google Calendar + iCal events and dated tasks. */
import { parseIcs } from '../shared/ics.js'
import type { AgendaItem, Category, NotifySettings } from '../shared/notify.js'
import { adminDb, readRows } from './_admin.js'
import { decryptToken, googleToken } from './_lib.js'

interface Source {
  id: string
  provider?: 'ics' | 'google'
  url: string
  account_id?: string | null
  calendar_id?: string | null
  category: Category
  enabled: 0 | 1
}

interface Account {
  id: string
  token: string
}

interface GEvent {
  id: string
  status?: string
  summary?: string
  location?: string
  start: { date?: string; dateTime?: string }
}

const DAY = 86_400_000

/** How far ahead to look so every rule (and tomorrow's all-day reminders) is covered. */
export function horizonMs(settings: NotifySettings) {
  const minutes = Math.max(0, ...settings.rules.map((r) => r.minutesBefore))
  const days = Math.max(0, ...settings.rules.map((r) => r.daysBefore))
  return Math.min(8 * DAY, minutes * 60_000 + (days + 1) * DAY)
}

async function googleEvents(uid: string, account: Account, source: Source, from: Date, to: Date): Promise<AgendaItem[]> {
  const { uid: owner, refresh_token } = await decryptToken(account.token)
  if (owner !== uid) return []
  const { access_token } = await googleToken({ grant_type: 'refresh_token', refresh_token })
  const params = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', maxResults: '500' })
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.calendar_id!)}/events?${params}`, {
    headers: { authorization: `Bearer ${access_token}` },
  })
  if (!res.ok) throw new Error(`Calendar ${res.status}`)
  const { items } = (await res.json()) as { items: GEvent[] }
  return items
    .filter((e) => e.status !== 'cancelled')
    .map((e) => ({
      id: `${source.id}:${e.id}`,
      kind: 'event' as const,
      title: e.summary || '(Sin título)',
      start: e.start.date ?? new Date(e.start.dateTime!).toISOString(),
      allDay: !!e.start.date,
      category: source.category,
      location: e.location ?? null,
      url: '/calendar',
    }))
}

async function icsEvents(source: Source, from: Date, to: Date): Promise<AgendaItem[]> {
  const res = await fetch(source.url.replace(/^webcal:\/\//i, 'https://'), { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`ICS ${res.status}`)
  return parseIcs(await res.text(), source.id, from, to).map((e) => ({
    id: e.id,
    kind: 'event' as const,
    title: e.title,
    start: e.start,
    allDay: !!e.all_day,
    category: source.category,
    location: e.location,
    url: '/calendar',
  }))
}

export async function buildAgenda(uid: string, settings: NotifySettings, now: Date) {
  const from = new Date(now.getTime() - DAY)
  const to = new Date(now.getTime() + horizonMs(settings))
  const [sources, accounts, tasksDoc] = await Promise.all([
    readRows<Source & { deleted_at?: string | null }>(uid, 'calendar_sources'),
    readRows<Account & { deleted_at?: string | null }>(uid, 'google_accounts'),
    adminDb().doc(`users/${uid}/server/tasks`).get(),
  ])
  const errors: string[] = []
  const lists = await Promise.all(
    sources
      .filter((s) => s.enabled)
      .map(async (s) => {
        try {
          if (s.provider === 'google') {
            const account = accounts.find((a) => a.id === s.account_id)
            return account ? await googleEvents(uid, account, s, from, to) : []
          }
          return await icsEvents(s, from, to)
        } catch (e) {
          errors.push(`${s.id}: ${e instanceof Error ? e.message : e}`)
          return []
        }
      }),
  )
  const tasks = ((tasksDoc.get('items') as AgendaItem[] | undefined) ?? []).filter((t) => {
    const start = new Date(t.allDay ? `${t.start}T00:00:00Z` : t.start).getTime()
    return start >= from.getTime() && start <= to.getTime()
  })
  return { items: [...lists.flat(), ...tasks], errors }
}
