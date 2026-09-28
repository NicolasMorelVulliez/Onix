import { describe, expect, it } from 'vitest'
import { applyQuery, groupRows } from './query'
import { shouldApplyRemote } from './merge'
import type { Page, Property } from './types'

const status: Property = {
  id: 's',
  name: 'Estado',
  type: 'status',
  options: [
    { id: 'todo', name: 'Por hacer', color: 'gray' },
    { id: 'done', name: 'Hecho', color: 'green' },
  ],
}
const num: Property = { id: 'n', name: 'Puntos', type: 'number' }
const schema = [status, num]

const row = (id: string, title: string, props: Page['props'], sort_key = id): Page => ({
  id,
  title,
  props,
  sort_key,
  parent_id: null,
  database_id: 'db',
  icon: null,
  kind: 'page',
  content: null,
  schema: null,
  is_template: 0,
  created_at: '',
  updated_at: '',
  deleted_at: null,
  purged: 0,
})

const rows = [
  row('a', 'Comprar pan', { s: 'done', n: 3 }),
  row('b', 'Estudiar UADE', { s: 'todo', n: 8 }),
  row('c', 'Reunión EGS', { n: 1 }),
]

describe('applyQuery', () => {
  it('filters by text contains', () => {
    const r = applyQuery(rows, schema, [{ id: '1', prop: 'title', op: 'contains', value: 'uade' }], [])
    expect(r.map((x) => x.id)).toEqual(['b'])
  })

  it('filters by select and emptiness', () => {
    expect(applyQuery(rows, schema, [{ id: '1', prop: 's', op: 'is', value: 'todo' }], []).map((x) => x.id)).toEqual(['b'])
    expect(applyQuery(rows, schema, [{ id: '1', prop: 's', op: 'is_empty' }], []).map((x) => x.id)).toEqual(['c'])
  })

  it('sorts numbers and keeps empty last', () => {
    expect(applyQuery(rows, schema, [], [{ prop: 'n', dir: 'desc' }]).map((x) => x.id)).toEqual(['b', 'a', 'c'])
    expect(applyQuery(rows, schema, [], [{ prop: 's', dir: 'asc' }]).map((x) => x.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('groupRows', () => {
  it('puts rows without value in a leading group', () => {
    const g = groupRows(rows, status)
    expect(g.map((x) => [x.id, x.rows.length])).toEqual([
      ['', 1],
      ['todo', 1],
      ['done', 1],
    ])
  })
})

describe('shouldApplyRemote', () => {
  const r = (updated_at: string, dirty?: 0 | 1) => ({ id: 'x', created_at: '', updated_at, deleted_at: null, purged: 0 as const, dirty })
  it('applies when there is no pending local edit', () => {
    expect(shouldApplyRemote(undefined, r('1'))).toBe(true)
    expect(shouldApplyRemote(r('2', 0), r('1'))).toBe(true)
  })
  it('keeps newer local edits', () => {
    expect(shouldApplyRemote(r('2', 1), r('1'))).toBe(false)
    expect(shouldApplyRemote(r('1', 1), r('2'))).toBe(true)
  })
})
