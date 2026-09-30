import { describe, expect, it } from 'vitest'
import { generateClasses, numbered } from './subjects'

describe('subjects', () => {
  it('generates classes on the chosen weekdays', () => {
    // Monday 19–22 and Thursday 19–21, from Mon 3 Aug to Thu 13 Aug 2026
    const c = generateClasses(
      [
        { weekday: 1, from: '19:00', to: '22:00' },
        { weekday: 4, from: '19:00', to: '21:00' },
      ],
      '2026-08-03',
      '2026-08-13',
    )
    expect(c.map((x) => `${x.date} ${x.from}`)).toEqual(['2026-08-03 19:00', '2026-08-06 19:00', '2026-08-10 19:00', '2026-08-13 19:00'])
  })

  it('names classes like the Drive folders and skips exams in the count', () => {
    const list = numbered([
      { date: '2026-08-10', from: '19:00', to: '22:00', topic: '', kind: 'clase' },
      { date: '2026-08-03', from: '19:00', to: '22:00', topic: '', kind: 'clase' },
      { date: '2026-08-17', from: '19:00', to: '22:00', topic: '', kind: 'parcial' },
      { date: '2026-08-24', from: '19:00', to: '22:00', topic: '', kind: 'clase' },
    ])
    expect(list.map((c) => c.title)).toEqual(['Clase 1 - 03 08', 'Clase 2 - 10 08', 'Parcial - 17 08', 'Clase 3 - 24 08'])
  })
})
