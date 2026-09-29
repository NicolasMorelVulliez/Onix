import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, plan, zonedTime, type AgendaItem, type NotifySettings } from './notify.js'

const TZ = 'America/Argentina/Buenos_Aires' // UTC-3, no DST
// Rule tests run without the morning summary; it has its own test.
const base: NotifySettings = { ...DEFAULT_SETTINGS(TZ), digest: { ...DEFAULT_SETTINGS(TZ).digest, enabled: false } }
const at = (local: string) => new Date(`${local}:00-03:00`)

const daily: AgendaItem = { id: 'e1', kind: 'event', title: 'Daily EGS', start: at('2026-10-05T10:00').toISOString(), allDay: false, category: 'laboral', url: '/calendar' }
const clase: AgendaItem = { id: 'e2', kind: 'event', title: 'Algoritmos', start: at('2026-10-05T19:00').toISOString(), allDay: false, category: 'uade', location: 'Aula 402', url: '/calendar' }
const tarea: AgendaItem = { id: 't1', kind: 'task', title: 'Entregar TP', start: '2026-10-05', allDay: true, url: '/p/t1' }

describe('zonedTime', () => {
  it('converts a local wall time to the right instant', () => {
    expect(zonedTime('2026-10-05', '08:30', TZ).toISOString()).toBe('2026-10-05T11:30:00.000Z')
  })
})

describe('plan', () => {
  it('fires an event reminder 10 min before, a little early is fine', () => {
    const r = plan(base, [daily], at('2026-10-05T09:48'), {})
    expect(r.map((p) => [p.title, p.body])).toEqual([['Daily EGS', 'Evento en 10 min · 10:00']])
    expect(plan(base, [daily], at('2026-10-05T09:40'), {})).toEqual([])
  })

  it('does not repeat what was already sent', () => {
    const [p] = plan(base, [daily], at('2026-10-05T09:50'), {})
    expect(plan(base, [daily], at('2026-10-05T09:55'), { [p.key]: 1 })).toEqual([])
  })

  it('respects the time range, weekdays and categories', () => {
    const quiet: NotifySettings = { ...base, rules: [{ ...base.rules[0], from: '08:00', to: '18:00' }] }
    expect(plan(quiet, [clase], at('2026-10-05T18:50'), {})).toEqual([]) // 18:50 is outside 08–18
    const weekend: NotifySettings = { ...base, rules: [{ ...base.rules[0], days: [0, 6] }] }
    expect(plan(weekend, [daily], at('2026-10-05T09:50'), {})).toEqual([]) // Monday
    const onlyUade: NotifySettings = { ...base, rules: [{ ...base.rules[0], categories: ['uade'] }] }
    expect(plan(onlyUade, [daily, clase], at('2026-10-05T18:50'), {}).map((p) => p.title)).toEqual(['Algoritmos'])
  })

  it('reminds all-day tasks at the chosen time', () => {
    const r = plan(base, [tarea], at('2026-10-05T09:00'), {})
    expect(r).toEqual([{ key: 'tasks:t1:2026-10-05', title: 'Entregar TP', body: 'Tarea · hoy', url: '/p/t1' }])
  })

  it('sends the morning summary once, with the day in order', () => {
    const noRules: NotifySettings = { ...DEFAULT_SETTINGS(TZ), rules: [] }
    const [d] = plan(noRules, [clase, tarea, daily], at('2026-10-05T08:30'), {})
    expect(d.title).toBe('Tu día: 2 eventos y 1 tarea')
    expect(d.body).toBe('Todo el día · Entregar TP\n10:00 · Daily EGS\n19:00 · Algoritmos')
    expect(plan(noRules, [daily], at('2026-10-05T08:40'), { [d.key]: 1 })).toEqual([])
    expect(plan(noRules, [daily], at('2026-10-05T08:00'), {})).toEqual([]) // too early
  })
})
