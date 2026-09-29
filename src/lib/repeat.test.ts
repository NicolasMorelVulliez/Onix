import { describe, expect, it } from 'vitest'
import { describeRepeat, nextOccurrence } from './repeat'

describe('nextOccurrence', () => {
  it('daily and every N days', () => {
    expect(nextOccurrence('2026-10-05', { freq: 'daily', interval: 1 }, '2026-10-05')).toBe('2026-10-06')
    expect(nextOccurrence('2026-10-05', { freq: 'daily', interval: 3 }, '2026-10-05')).toBe('2026-10-08')
  })

  it('weekly on chosen weekdays', () => {
    // Monday 5 → Wednesday 7 (Mon/Wed/Fri)
    const mwf = { freq: 'weekly' as const, interval: 1, weekdays: [1, 3, 5] }
    expect(nextOccurrence('2026-10-05', mwf, '2026-10-05')).toBe('2026-10-07')
    expect(nextOccurrence('2026-10-09', mwf, '2026-10-09')).toBe('2026-10-12')
    // Every 2 weeks on Monday
    expect(nextOccurrence('2026-10-05', { freq: 'weekly', interval: 2, weekdays: [1] }, '2026-10-05')).toBe('2026-10-19')
  })

  it('monthly keeps the day, clamping short months', () => {
    expect(nextOccurrence('2026-10-15', { freq: 'monthly', interval: 1 }, '2026-10-15')).toBe('2026-11-15')
    expect(nextOccurrence('2027-01-31', { freq: 'monthly', interval: 1 }, '2027-01-31')).toBe('2027-02-28')
    expect(nextOccurrence('2026-11-10', { freq: 'monthly', interval: 3 }, '2026-11-10')).toBe('2027-02-10')
  })

  it('yearly and leap days', () => {
    expect(nextOccurrence('2028-02-29', { freq: 'yearly', interval: 1 }, '2028-02-29')).toBe('2029-02-28')
  })

  it('overdue tasks jump to the next date from today on', () => {
    expect(nextOccurrence('2026-09-01', { freq: 'weekly', interval: 1 }, '2026-09-29')).toBe('2026-09-29')
    expect(nextOccurrence('2026-09-01', { freq: 'daily', interval: 1 }, '2026-09-29')).toBe('2026-09-29')
  })
})

describe('describeRepeat', () => {
  it('reads naturally', () => {
    expect(describeRepeat({ freq: 'weekly', interval: 1, weekdays: [5, 1] })).toBe('Todas las semanas (lunes, viernes)')
    expect(describeRepeat({ freq: 'daily', interval: 2 })).toBe('Cada 2 días')
  })
})
