/**
 * Pure helpers for Notion's "Markdown & CSV" export: file names, CSV, property types.
 */
import type { OptionColor, PropValue, Property, SelectOption } from './types'

const COLORS: OptionColor[] = ['gray', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'red', 'brown']

/** "Mi página 1f2e3d4c5b6a79881f2e3d4c5b6a7988.md" → "Mi página" */
export function notionName(fileOrDir: string) {
  const base = fileOrDir.split('/').pop()!.replace(/\.(md|csv)$/i, '').replace(/_all$/, '')
  return base.replace(/\s+[0-9a-f]{32}$/i, '').trim() || 'Sin título'
}

/** RFC 4180 CSV (quotes, escaped quotes, newlines inside quotes, optional BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

const ES_MONTHS: Record<string, string> = {
  enero: 'January', febrero: 'February', marzo: 'March', abril: 'April', mayo: 'May', junio: 'June',
  julio: 'July', agosto: 'August', septiembre: 'September', setiembre: 'September', octubre: 'October',
  noviembre: 'November', diciembre: 'December',
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Notion dates: "October 5, 2026", "October 5, 2026 10:00 AM", "5 de octubre de 2026", ISO. */
export function parseNotionDate(raw: string): string | null {
  let s = raw.trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  s = s.replace(/(\d+) de (\w+) de (\d{4})/i, (m, d, mon, y) => (ES_MONTHS[mon.toLowerCase()] ? `${ES_MONTHS[mon.toLowerCase()]} ${d}, ${y}` : m))
  s = s.replace(/\s*\(GMT[^)]*\)\s*$/, '')
  const hasTime = /\d{1,2}:\d{2}/.test(s)
  // Needs a year and a month name or a numeric date, so plain numbers or text don't count.
  if (!/\d{4}/.test(s) || !/[a-z]{3,}|\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/i.test(s)) return null
  const t = Date.parse(s)
  if (Number.isNaN(t)) return null
  const d = new Date(t)
  return hasTime ? d.toISOString() : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const isYes = (v: string) => /^(yes|no|sí|si|true|false)$/i.test(v.trim())
const isNumber = (v: string) => /^-?[$€]?\s?\d[\d.,]*\s?%?$/.test(v.trim())
const toNumber = (v: string) => {
  const s = v.replace(/[$€%\s]/g, '')
  // "1.234,56" (es) vs "1,234.56" (en)
  const n = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  return Number(n)
}

/** Guesses Onix property types from the values of each CSV column. */
export function inferSchema(header: string[], rows: string[][], id: (i: number) => string): Property[] {
  return header.slice(1).map((name, idx) => {
    const col = idx + 1
    const values = rows.map((r) => (r[col] ?? '').trim()).filter(Boolean)
    const prop: Property = { id: id(col), name: name.trim() || `Propiedad ${col}`, type: 'text' }
    if (!values.length) return prop
    const every = (f: (v: string) => boolean) => values.every(f)
    if (every(isYes)) return { ...prop, type: 'checkbox' }
    if (every((v) => /^https?:\/\//.test(v))) return { ...prop, type: 'url' }
    if (every((v) => v.split('→').every((p) => parseNotionDate(p) !== null))) return { ...prop, type: 'date' }
    if (every(isNumber)) return { ...prop, type: 'number' }

    const multi = values.some((v) => v.includes(', ')) && values.every((v) => v.split(', ').every((t) => t.length <= 40))
    const tokens = multi ? values.flatMap((v) => v.split(', ')) : values
    const distinct = [...new Set(tokens)]
    const repeats = tokens.length > distinct.length
    const hinted = /^(status|estado|tipo|type|categor[ií]a|category|prioridad|priority|etiquetas?|tags?)$/i.test(prop.name.trim())
    if (distinct.length <= 30 && distinct.every((t) => t.length <= 40) && (repeats || hinted)) {
      const options: SelectOption[] = distinct.map((n, i) => ({ id: `${prop.id}-${i}`, name: n, color: COLORS[i % COLORS.length] }))
      const type = multi ? 'multi_select' : /^(status|estado)$/i.test(prop.name) ? 'status' : 'select'
      return { ...prop, type, options }
    }
    return prop
  })
}

export function cellValue(prop: Property, raw: string): PropValue {
  const v = raw.trim()
  if (!v) return null
  switch (prop.type) {
    case 'checkbox':
      return /^(yes|sí|si|true)$/i.test(v)
    case 'number':
      return toNumber(v)
    case 'date': {
      const [a, b] = v.split('→').map((x) => parseNotionDate(x))
      return a ? (b ? { start: a, end: b } : { start: a }) : null
    }
    case 'select':
    case 'status':
      return prop.options?.find((o) => o.name === v)?.id ?? null
    case 'multi_select':
      return v.split(', ').map((t) => prop.options?.find((o) => o.name === t)?.id).filter((x): x is string => !!x)
    default:
      return v
  }
}
