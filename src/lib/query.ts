import type { DateValue, Filter, Page, Property, PropValue, Sort } from './types'
import { bySortKey } from './util'

export function getValue(row: Page, propId: string): PropValue {
  return propId === 'title' ? row.title : (row.props[propId] ?? null)
}

/** Text used for "contains" filters and sorting. */
export function valueText(value: PropValue, prop?: Property): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map((v) => optionName(prop, v)).join(', ')
  if (typeof value === 'object') return (value as DateValue).start
  if (prop && (prop.type === 'select' || prop.type === 'status')) return optionName(prop, String(value))
  return String(value)
}

function optionName(prop: Property | undefined, id: string) {
  return prop?.options?.find((o) => o.id === id)?.name ?? id
}

export function isEmpty(value: PropValue) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0)
}

export function matchesFilter(row: Page, f: Filter, schema: Property[]): boolean {
  const prop = schema.find((p) => p.id === f.prop)
  const value = getValue(row, f.prop)
  switch (f.op) {
    case 'is_empty':
      return isEmpty(value)
    case 'not_empty':
      return !isEmpty(value)
    case 'checked':
      return value === true
    case 'unchecked':
      return value !== true
    case 'contains':
      return valueText(value, prop).toLowerCase().includes((f.value ?? '').toLowerCase())
    case 'is':
      return Array.isArray(value) ? value.includes(f.value ?? '') : String(value ?? '') === (f.value ?? '')
    case 'is_not':
      return Array.isArray(value) ? !value.includes(f.value ?? '') : String(value ?? '') !== (f.value ?? '')
  }
}

function compare(a: PropValue, b: PropValue, prop?: Property) {
  if (isEmpty(a) && isEmpty(b)) return 0
  if (isEmpty(a)) return 1 // empty values last
  if (isEmpty(b)) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  if (prop && (prop.type === 'select' || prop.type === 'status') && prop.options) {
    // Order by option position, like Notion.
    const ia = prop.options.findIndex((o) => o.id === a)
    const ib = prop.options.findIndex((o) => o.id === b)
    return ia - ib
  }
  return valueText(a, prop).localeCompare(valueText(b, prop), 'es', { numeric: true })
}

export function applyQuery(rows: Page[], schema: Property[], filters: Filter[], sorts: Sort[]) {
  const filtered = rows.filter((r) => filters.every((f) => matchesFilter(r, f, schema)))
  filtered.sort(bySortKey)
  if (sorts.length) {
    filtered.sort((ra, rb) => {
      for (const s of sorts) {
        const prop = schema.find((p) => p.id === s.prop)
        const c = compare(getValue(ra, s.prop), getValue(rb, s.prop), prop)
        if (c !== 0) return s.dir === 'asc' ? c : -c
      }
      return 0
    })
  }
  return filtered
}

export interface Group {
  id: string // option id or '' for "no value"
  name: string
  color: string
  rows: Page[]
}

export function groupRows(rows: Page[], prop: Property): Group[] {
  const groups: Group[] = (prop.options ?? []).map((o) => ({ id: o.id, name: o.name, color: o.color, rows: [] }))
  const none: Group = { id: '', name: `Sin ${prop.name.toLowerCase()}`, color: 'gray', rows: [] }
  for (const r of rows) {
    const v = r.props[prop.id]
    const g = typeof v === 'string' ? groups.find((x) => x.id === v) : undefined
    ;(g ?? none).rows.push(r)
  }
  return none.rows.length ? [none, ...groups] : groups
}
