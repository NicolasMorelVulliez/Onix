import { describe, expect, it } from 'vitest'
import { cellValue, inferSchema, notionName, parseCsv, parseNotionDate } from './notion-parse'

describe('notion export parsing', () => {
  it('strips the Notion id from names', () => {
    expect(notionName('Export/UADE 1f2e3d4c5b6a79881f2e3d4c5b6a7988/Parcial 2 aa2e3d4c5b6a79881f2e3d4c5b6a7988.md')).toBe('Parcial 2')
    expect(notionName('Tareas 1f2e3d4c5b6a79881f2e3d4c5b6a7988_all.csv')).toBe('Tareas')
  })

  it('reads CSV with quotes and line breaks', () => {
    expect(parseCsv('﻿Name,Notas\n"Hola, mundo","dice ""sí""\nsegunda línea"\n')).toEqual([
      ['Name', 'Notas'],
      ['Hola, mundo', 'dice "sí"\nsegunda línea'],
    ])
  })

  it('understands Notion dates in English and Spanish', () => {
    expect(parseNotionDate('October 5, 2026')).toBe('2026-10-05')
    expect(parseNotionDate('5 de octubre de 2026')).toBe('2026-10-05')
    expect(parseNotionDate('October 5, 2026 10:30 AM')).toBe(new Date('October 5, 2026 10:30 AM').toISOString())
    expect(parseNotionDate('Comprar pan')).toBeNull()
  })

  it('infers property types from the values', () => {
    const csv = parseCsv(
      [
        'Name,Estado,Fecha,Puntos,Hecho,Tags,Link,Notas',
        'TP 1,Done,"October 5, 2026",3,Yes,"UADE, Parcial",https://a.com,algo largo',
        'TP 2,In progress,"October 9, 2026",8,No,UADE,https://b.com,otra cosa distinta',
        'TP 3,Done,,5,No,,,',
      ].join('\n'),
    )
    const [header, ...rows] = csv
    const schema = inferSchema(header, rows, (i) => `p${i}`)
    expect(schema.map((p) => [p.name, p.type])).toEqual([
      ['Estado', 'status'],
      ['Fecha', 'date'],
      ['Puntos', 'number'],
      ['Hecho', 'checkbox'],
      ['Tags', 'multi_select'],
      ['Link', 'url'],
      ['Notas', 'text'],
    ])
    expect(cellValue(schema[0], 'Done')).toBe(schema[0].options!.find((o) => o.name === 'Done')!.id)
    expect(cellValue(schema[1], 'October 5, 2026')).toEqual({ start: '2026-10-05' })
    expect(cellValue(schema[3], 'Yes')).toBe(true)
    expect(cellValue(schema[4], 'UADE, Parcial')).toHaveLength(2)
  })
})
