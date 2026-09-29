/**
 * Notification rules and planning, shared by the app (settings UI) and the server
 * (the cron tick decides what to send). Pure functions: easy to test.
 */

export type Category = 'laboral' | 'personal' | 'uade'

export interface NotifyRule {
  id: string
  enabled: boolean
  type: 'event' | 'task'
  /** Only for events; empty = every category. */
  categories: Category[]
  /** Items with a time: how long before the start. */
  minutesBefore: number
  /** All-day items: notify at this local time… */
  allDayAt: string
  /** …this many days before (0 = the same day). */
  daysBefore: number
  /** Allowed time range (local, HH:MM). `to` earlier than `from` spans midnight. */
  from: string
  to: string
  /** Allowed weekdays, 0 = Sunday … 6 = Saturday. */
  days: number[]
}

export interface NotifySettings {
  timezone: string
  rules: NotifyRule[]
  digest: { enabled: boolean; time: string; days: number[] }
}

export interface AgendaItem {
  id: string
  kind: 'event' | 'task'
  title: string
  /** yyyy-mm-dd (all-day) or ISO datetime. */
  start: string
  allDay: boolean
  category?: Category
  location?: string | null
  /** Path inside the app to open when the notification is tapped. */
  url: string
}

export interface Planned {
  key: string
  title: string
  body: string
  url: string
}

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

export const DEFAULT_SETTINGS = (timezone: string): NotifySettings => ({
  timezone,
  rules: [
    { id: 'events', enabled: true, type: 'event', categories: [], minutesBefore: 10, allDayAt: '09:00', daysBefore: 0, from: '07:00', to: '23:00', days: ALL_DAYS },
    { id: 'tasks', enabled: true, type: 'task', categories: [], minutesBefore: 30, allDayAt: '09:00', daysBefore: 0, from: '07:00', to: '23:00', days: ALL_DAYS },
  ],
  digest: { enabled: true, time: '08:30', days: ALL_DAYS },
})

// ---------- Time zones ----------

export function localParts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  })
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]))
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday),
  }
}

/** The instant when it is `time` on `date` in `timeZone`. */
export function zonedTime(date: string, time: string, timeZone: string) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  // Shift by the zone's offset at that moment (twice, to settle around DST changes).
  let t = guess
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(t), timeZone)
    const [py, pm, pd] = p.date.split('-').map(Number)
    const [ph, pmin] = p.time.split(':').map(Number)
    t += guess - Date.UTC(py, pm - 1, pd, ph, pmin)
  }
  return new Date(t)
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const inWindow = (time: string, from: string, to: string) =>
  from <= to ? time >= from && time <= to : time >= from || time <= to

// ---------- Planning ----------

/** Send a bit early rather than late: the scheduler only wakes up every few minutes. */
export const LEAD_MS = 3 * 60_000
const STALE_MS = 60 * 60_000

export function plan(settings: NotifySettings, items: AgendaItem[], now: Date, sent: Record<string, number>): Planned[] {
  const tz = settings.timezone
  const out: Planned[] = []
  const nowMs = now.getTime()

  for (const rule of settings.rules) {
    if (!rule.enabled) continue
    for (const item of items) {
      if (item.kind !== rule.type) continue
      if (rule.type === 'event' && rule.categories.length && (!item.category || !rule.categories.includes(item.category))) continue
      const fire = item.allDay
        ? zonedTime(addDays(item.start.slice(0, 10), -rule.daysBefore), rule.allDayAt, tz)
        : new Date(new Date(item.start).getTime() - rule.minutesBefore * 60_000)
      const t = fire.getTime()
      if (t > nowMs + LEAD_MS || t < nowMs - STALE_MS) continue
      const local = localParts(fire, tz)
      if (!rule.days.includes(local.weekday) || !inWindow(local.time, rule.from, rule.to)) continue
      const key = `${rule.id}:${item.id}:${item.start}`
      if (sent[key]) continue
      out.push({ key, title: item.title, body: describe(item, rule, tz), url: item.url })
    }
  }

  const digest = planDigest(settings, items, now, sent)
  if (digest) out.push(digest)
  return out
}

function describe(item: AgendaItem, rule: NotifyRule, tz: string) {
  const prefix = item.kind === 'task' ? 'Tarea' : 'Evento'
  if (item.allDay) return `${prefix} · ${rule.daysBefore === 0 ? 'hoy' : rule.daysBefore === 1 ? 'mañana' : `en ${rule.daysBefore} días`}`
  const at = localParts(new Date(item.start), tz).time
  const when = rule.minutesBefore === 0 ? 'ahora' : rule.minutesBefore < 60 ? `en ${rule.minutesBefore} min` : `en ${Math.round(rule.minutesBefore / 60)} h`
  return [`${prefix} ${when} · ${at}`, item.location].filter(Boolean).join(' · ')
}

function planDigest(settings: NotifySettings, items: AgendaItem[], now: Date, sent: Record<string, number>): Planned | null {
  const { digest, timezone: tz } = settings
  if (!digest.enabled) return null
  const today = localParts(now, tz)
  const key = `digest:${today.date}`
  if (sent[key] || !digest.days.includes(today.weekday)) return null
  const at = zonedTime(today.date, digest.time, tz).getTime()
  const nowMs = now.getTime()
  if (nowMs < at - LEAD_MS || nowMs > at + 3 * STALE_MS) return null

  const todays = items
    .filter((i) => (i.allDay ? i.start.slice(0, 10) === today.date : localParts(new Date(i.start), tz).date === today.date))
    .sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1))
  const events = todays.filter((i) => i.kind === 'event').length
  const tasks = todays.length - events
  const count = [events && `${events} ${events === 1 ? 'evento' : 'eventos'}`, tasks && `${tasks} ${tasks === 1 ? 'tarea' : 'tareas'}`]
    .filter(Boolean)
    .join(' y ')
  const lines = todays.slice(0, 8).map((i) => `${i.allDay ? 'Todo el día' : localParts(new Date(i.start), tz).time} · ${i.title}`)
  if (todays.length > 8) lines.push(`y ${todays.length - 8} más`)
  return {
    key,
    title: todays.length ? `Tu día: ${count}` : 'Tu día está libre',
    body: todays.length ? lines.join('\n') : 'No tenés eventos ni tareas para hoy.',
    url: '/calendar',
  }
}
