import type { Property, RepeatRule } from './types'

/** Recurring tasks: pure date math, so it can be tested. Dates are local "yyyy-mm-dd". */

const DONE = /^(done|hecho|hecha|completad[oa]|terminad[oa]|listo|lista|finalizad[oa])$/i

export function isDoneOption(prop: Property | undefined, value: unknown) {
  if (!prop || typeof value !== 'string') return false
  const option = prop.options?.find((o) => o.id === value)
  return value === 'done' || (!!option && DONE.test(option.name))
}

const parse = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}
const fmt = (d: Date) => d.toISOString().slice(0, 10)
const plusDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
const weekStart = (d: Date) => plusDays(d, -((d.getUTCDay() + 6) % 7)) // Monday

function step(from: string, r: RepeatRule): string {
  const d = parse(from)
  const n = Math.max(1, r.interval)
  switch (r.freq) {
    case 'daily':
      return fmt(plusDays(d, n))
    case 'weekly': {
      if (!r.weekdays?.length) return fmt(plusDays(d, 7 * n))
      const base = weekStart(d).getTime()
      for (let i = 1; i <= 7 * n + 7; i++) {
        const c = plusDays(d, i)
        const weeks = Math.round((weekStart(c).getTime() - base) / (7 * 86_400_000))
        if (r.weekdays.includes(c.getUTCDay()) && weeks % n === 0) return fmt(c)
      }
      return fmt(plusDays(d, 7 * n))
    }
    case 'monthly': {
      // Same day of the month; 31 → the last day in shorter months.
      const total = d.getUTCMonth() + n
      const y = d.getUTCFullYear() + Math.floor(total / 12)
      const m = ((total % 12) + 12) % 12
      return fmt(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay(y, m)))))
    }
    case 'yearly': {
      const y = d.getUTCFullYear() + n
      const m = d.getUTCMonth()
      return fmt(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay(y, m)))))
    }
  }
}

/** Next date after `from` that isn't before `today` (overdue tasks catch up). */
export function nextOccurrence(from: string, rule: RepeatRule, today: string) {
  let next = step(from, rule)
  for (let i = 0; next < today && i < 1000; i++) next = step(next, rule)
  return next
}

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export function describeRepeat(r: RepeatRule) {
  const n = Math.max(1, r.interval)
  switch (r.freq) {
    case 'daily':
      return n === 1 ? 'Todos los días' : `Cada ${n} días`
    case 'weekly': {
      const days = r.weekdays?.length ? ` (${[...r.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAYS[d]).join(', ')})` : ''
      return (n === 1 ? 'Todas las semanas' : `Cada ${n} semanas`) + days
    }
    case 'monthly':
      return n === 1 ? 'Todos los meses' : `Cada ${n} meses`
    case 'yearly':
      return n === 1 ? 'Todos los años' : `Cada ${n} años`
  }
}
