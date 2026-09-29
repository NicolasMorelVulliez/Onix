import { refreshSource } from './calendar'
import { db } from './db'
import { gfetch } from './google'
import type { CalendarEvent, CalendarSource } from './types'
import { uid } from './util'

/** What the event editor produces. Times are local "yyyy-mm-dd" + "HH:MM". */
export interface EventDraft {
  sourceId: string
  title: string
  allDay: boolean
  date: string
  start: string
  endDate: string
  end: string
  location: string
  description: string
  guests: string
  meet: boolean
}

interface GEventBody {
  summary: string
  location?: string
  description?: string
  start: { date?: string; dateTime?: string }
  end: { date?: string; dateTime?: string }
  attendees?: { email: string }[]
  conferenceData?: unknown
}

const base = (s: CalendarSource) => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(s.calendar_id!)}/events`

/** The Google event id inside our cached event id ("<sourceId>:<googleId>"). */
export const googleEventId = (e: CalendarEvent) => e.id.slice(e.source_id.length + 1)

async function source(id: string) {
  const s = await db.calendar_sources.get(id)
  if (!s || s.provider !== 'google') throw new Error('Ese calendario no es de Google')
  return s
}

function toBody(d: EventDraft, withMeet: boolean): GEventBody {
  const nextDay = (x: string) => {
    const t = new Date(`${x}T12:00`)
    t.setDate(t.getDate() + 1)
    return t.toISOString().slice(0, 10)
  }
  return {
    summary: d.title.trim() || '(Sin título)',
    location: d.location || undefined,
    description: d.description || undefined,
    // Google's all-day end date is exclusive.
    start: d.allDay ? { date: d.date } : { dateTime: new Date(`${d.date}T${d.start}`).toISOString() },
    end: d.allDay ? { date: nextDay(d.endDate || d.date) } : { dateTime: new Date(`${d.endDate || d.date}T${d.end}`).toISOString() },
    attendees: d.guests
      .split(/[\s,;]+/)
      .filter((g) => g.includes('@'))
      .map((email) => ({ email })),
    ...(withMeet ? { conferenceData: { createRequest: { requestId: uid(), conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}),
  }
}

const send = (s: CalendarSource, url: string, method: string, body?: unknown) =>
  gfetch<{ id: string; attendees?: { email: string }[]; description?: string; hangoutLink?: string }>(s.account_id!, url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

export async function createEvent(d: EventDraft) {
  const s = await source(d.sourceId)
  const body = toBody(d, d.meet)
  const params = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: body.attendees?.length ? 'all' : 'none' })
  await send(s, `${base(s)}?${params}`, 'POST', body)
  await refreshSource(s)
}

export async function updateEvent(e: CalendarEvent, d: EventDraft) {
  const s = await source(e.source_id)
  const body = toBody(d, d.meet && !e.meet_url)
  const params = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: body.attendees?.length ? 'all' : 'none' })
  await send(s, `${base(s)}/${encodeURIComponent(googleEventId(e))}?${params}`, 'PATCH', body)
  await refreshSource(s)
}

/** Only moves the event (drag & drop / resize in the calendar). */
export async function moveEvent(e: CalendarEvent, start: Date, end: Date, allDay: boolean) {
  const s = await source(e.source_id)
  const day = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  await send(s, `${base(s)}/${encodeURIComponent(googleEventId(e))}?sendUpdates=all`, 'PATCH', {
    start: allDay ? { date: day(start) } : { dateTime: start.toISOString() },
    end: allDay ? { date: day(end) } : { dateTime: end.toISOString() },
  })
  await refreshSource(s)
}

export async function deleteEvent(e: CalendarEvent) {
  const s = await source(e.source_id)
  await gfetch(s.account_id!, `${base(s)}/${encodeURIComponent(googleEventId(e))}?sendUpdates=all`, { method: 'DELETE' })
  await refreshSource(s)
}

/** Guests aren't cached locally; read them when opening the editor. */
export async function eventGuests(e: CalendarEvent) {
  const s = await source(e.source_id)
  const full = await send(s, `${base(s)}/${encodeURIComponent(googleEventId(e))}`, 'GET')
  return (full.attendees ?? []).map((a) => a.email).join(', ')
}
