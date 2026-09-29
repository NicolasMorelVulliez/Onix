import { describe, expect, it } from 'vitest'
import { parseIcs } from './ics.js'

// Outlook-style file: Windows time zone name, weekly class with one moved and one cancelled occurrence.
const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:Microsoft Exchange Server 2010
BEGIN:VTIMEZONE
TZID:Argentina Standard Time
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:-0300
TZOFFSETTO:-0300
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:clase-1
SUMMARY:Algoritmos
LOCATION:Aula 402
DTSTART;TZID=Argentina Standard Time:20261005T190000
DTEND;TZID=Argentina Standard Time:20261005T220000
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE;TZID=Argentina Standard Time:20261019T190000
END:VEVENT
BEGIN:VEVENT
UID:clase-1
RECURRENCE-ID;TZID=Argentina Standard Time:20261012T190000
SUMMARY:Algoritmos (parcial)
DTSTART;TZID=Argentina Standard Time:20261012T180000
DTEND;TZID=Argentina Standard Time:20261012T210000
END:VEVENT
BEGIN:VEVENT
UID:feriado
SUMMARY:Feriado
DTSTART;VALUE=DATE:20261012
DTEND;VALUE=DATE:20261013
END:VEVENT
BEGIN:VEVENT
UID:cancelada
SUMMARY:Reunión cancelada
STATUS:CANCELLED
DTSTART:20261006T150000Z
DTEND:20261006T160000Z
END:VEVENT
END:VCALENDAR`

describe('parseIcs', () => {
  const events = parseIcs(ICS, 'uade', new Date('2026-10-01'), new Date('2026-11-30'))

  it('expands recurrences with exceptions, moved occurrences and time zones', () => {
    const clases = events.filter((e) => e.title.startsWith('Algoritmos'))
    expect(clases.map((e) => [e.title, e.start])).toEqual([
      ['Algoritmos', '2026-10-05T22:00:00.000Z'],
      ['Algoritmos (parcial)', '2026-10-12T21:00:00.000Z'],
      ['Algoritmos', '2026-10-26T22:00:00.000Z'],
    ])
    expect(clases[0].location).toBe('Aula 402')
  })

  it('keeps all-day dates and drops cancelled events', () => {
    expect(events.find((e) => e.title === 'Feriado')).toMatchObject({ start: '2026-10-12', end: '2026-10-13', all_day: 1 })
    expect(events.some((e) => e.title === 'Reunión cancelada')).toBe(false)
  })

  it('ignores events outside the range', () => {
    expect(parseIcs(ICS, 'uade', new Date('2027-01-01'), new Date('2027-02-01'))).toEqual([])
  })
})
