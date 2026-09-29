import { describe, expect, it } from 'vitest'
import { parseQuickTask } from './quick-parse.js'

const TZ = 'America/Argentina/Buenos_Aires'
// Tuesday, 29 Sep 2026, 19:30 in Buenos Aires
const now = new Date('2026-09-29T19:30:00-03:00')
const p = (s: string) => parseQuickTask(s, now, TZ)

describe('parseQuickTask', () => {
  it('reads relative days and times', () => {
    expect(p('comprar yerba mañana a las 10')).toEqual({ title: 'Comprar yerba', date: '2026-09-30', time: '10:00' })
    expect(p('llamar a mamá hoy 20:30')).toEqual({ title: 'Llamar a mamá', date: '2026-09-29', time: '20:30' })
    expect(p('estudiar pasado mañana')).toEqual({ title: 'Estudiar', date: '2026-10-01', time: undefined })
  })

  it('reads weekdays (always ahead) and dd/mm dates', () => {
    expect(p('reunión con Juan el jueves 15hs')).toEqual({ title: 'Reunión con Juan', date: '2026-10-01', time: '15:00' })
    expect(p('entregar TP el martes')).toMatchObject({ title: 'Entregar TP', date: '2026-10-06' })
    expect(p('pagar la tarjeta el 10/10')).toMatchObject({ title: 'Pagar la tarjeta', date: '2026-10-10' })
    expect(p('renovar DNI 5/3')).toMatchObject({ date: '2027-03-05' })
  })

  it('a time alone means the next time it happens', () => {
    expect(p('sacar la basura a las 21')).toMatchObject({ date: '2026-09-29', time: '21:00' })
    expect(p('correr a las 7')).toMatchObject({ date: '2026-09-30', time: '07:00' })
  })

  it('leaves plain numbers and text alone', () => {
    expect(p('comprar 2 kilos de pan a las 10')).toEqual({ title: 'Comprar 2 kilos de pan', date: '2026-09-30', time: '10:00' })
    expect(p('leer capítulo 4')).toEqual({ title: 'Leer capítulo 4', date: undefined, time: undefined })
  })
})
