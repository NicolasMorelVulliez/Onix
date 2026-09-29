import ICAL from 'ical.js'
import type { CalendarEvent } from '../src/lib/types.ts'

const MAX_OCCURRENCES = 2000

function toValue(t: ICAL.Time) {
  // All-day dates stay as yyyy-mm-dd so they don't shift with time zones.
  return t.isDate ? t.toString() : t.toJSDate().toISOString()
}

/**
 * Parses an .ics file into events between `from` and `to`, expanding recurring
 * events (RRULE) and applying their modified/cancelled occurrences.
 */
export function parseIcs(text: string, sourceId: string, from: Date, to: Date): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(text))
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz)

  const vevents = root.getAllSubcomponents('vevent')
  const masters = new Set(vevents.filter((v) => !v.hasProperty('recurrence-id')).map((v) => v.getFirstPropertyValue('uid')))
  const rangeStart = ICAL.Time.fromJSDate(from, true)
  const rangeEnd = ICAL.Time.fromJSDate(to, true)
  const out: CalendarEvent[] = []

  const push = (uid: string, e: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    if (e.component.getFirstPropertyValue('status') === 'CANCELLED') return
    if (end.compare(rangeStart) < 0 || start.compare(rangeEnd) > 0) return
    const startValue = toValue(start)
    out.push({
      id: `${sourceId}:${uid}:${startValue}`,
      source_id: sourceId,
      title: e.summary || '(Sin título)',
      start: startValue,
      end: toValue(end),
      all_day: start.isDate ? 1 : 0,
      location: e.location || null,
      description: e.description || null,
    })
  }

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent)
    const uid = event.uid
    // Modified occurrences are emitted through their master's iterator.
    if (event.isRecurrenceException() && masters.has(uid)) continue
    if (!event.startDate) continue

    if (!event.isRecurring()) {
      push(uid, event, event.startDate, event.endDate ?? event.startDate)
      continue
    }
    const it = event.iterator()
    for (let i = 0, next = it.next(); next && i < MAX_OCCURRENCES; i++, next = it.next()) {
      if (next.compare(rangeEnd) > 0) break
      const d = event.getOccurrenceDetails(next)
      push(uid, d.item, d.startDate, d.endDate)
    }
  }
  return out
}
