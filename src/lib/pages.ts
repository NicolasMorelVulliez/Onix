import { db } from './db'
import { bySortKey, keyAfter, keyBetween, now, uid } from './util'
import type { DateValue, Page, Property, PropValue, View } from './types'
import { combine, dayOf, hm, isTimed, todayYmd } from './dates'
import { isDoneOption, nextOccurrence } from './repeat'
import { schedulePush } from './sync'

function base() {
  const t = now()
  return { id: uid(), created_at: t, updated_at: t, deleted_at: null, purged: 0 as const, dirty: 1 as const }
}

export async function lastChildKey(parentId: string | null, databaseId: string | null = null) {
  const siblings = await db.pages
    .filter((p) => p.parent_id === parentId && p.database_id === databaseId)
    .toArray()
  return siblings.sort(bySortKey).at(-1)?.sort_key ?? null
}

export async function createPage(init: Partial<Page> = {}): Promise<Page> {
  const parent_id = init.parent_id ?? null
  const database_id = init.database_id ?? null
  const page: Page = {
    ...base(),
    parent_id,
    database_id,
    sort_key: keyAfter(await lastChildKey(parent_id, database_id)),
    title: '',
    icon: null,
    kind: 'page',
    content: null,
    schema: null,
    props: {},
    is_template: 0,
    ...init,
  }
  await db.pages.add(page)
  schedulePush()
  return page
}

export async function updatePage(id: string, changes: Partial<Page>) {
  await db.pages.update(id, { ...changes, updated_at: now(), dirty: 1 })
  schedulePush()
}

export async function setRowProp(id: string, propId: string, value: PropValue) {
  const page = await db.pages.get(id)
  if (!page) return
  const props = { ...page.props, [propId]: value }
  const database = page.repeat && page.database_id ? await db.pages.get(page.database_id) : undefined
  const prop = database?.schema?.find((p) => p.id === propId)
  const dateProp = database?.schema?.find((p) => p.type === 'date')
  const completing = prop && ((prop.type === 'checkbox' && value === true) || (prop.options && isDoneOption(prop, value)))
  // Recurring task marked done: move it to its next date and leave it pending.
  if (page.repeat && completing && dateProp) {
    const current = (props[dateProp.id] as DateValue | null) ?? null
    const next = nextOccurrence(current?.start ? dayOf(current.start) : todayYmd(), page.repeat, todayYmd())
    props[dateProp.id] = moveToDay(current, next)
    props[propId] = prop.type === 'checkbox' ? false : (prop.options?.find((o) => !isDoneOption(prop, o.id))?.id ?? null)
  }
  await updatePage(id, { props })
}

/** Same time and duration, another day. */
function moveToDay(v: DateValue | null, day: string): DateValue {
  if (!v?.start || !isTimed(v.start)) return { start: day }
  const start = combine(day, hm(new Date(v.start)))
  const end = v.end && isTimed(v.end) ? new Date(new Date(start).getTime() + new Date(v.end).getTime() - new Date(v.start).getTime()).toISOString() : undefined
  return end ? { start, end } : { start }
}

/** Collects the page and all its descendants (children and database rows). */
async function subtree(id: string): Promise<Page[]> {
  const all = await db.pages.toArray()
  const out: Page[] = []
  const walk = (pid: string) => {
    for (const p of all) {
      if (p.parent_id === pid || p.database_id === pid) {
        out.push(p)
        walk(p.id)
      }
    }
  }
  const root = all.find((p) => p.id === id)
  if (root) out.push(root)
  walk(id)
  return out
}

export async function trashPage(id: string) {
  const t = now()
  const pages = await subtree(id)
  await db.pages.bulkUpdate(
    pages.filter((p) => !p.deleted_at).map((p) => ({ key: p.id, changes: { deleted_at: t, updated_at: t, dirty: 1 as const } })),
  )
  schedulePush()
}

export async function restorePage(id: string) {
  const root = await db.pages.get(id)
  if (!root?.deleted_at) return
  const t = now()
  const pages = (await subtree(id)).filter((p) => p.deleted_at === root.deleted_at)
  // If the parent is still in the trash, restore to the top level.
  const parent = root.parent_id ? await db.pages.get(root.parent_id) : null
  const detach = parent?.deleted_at ? { parent_id: null } : {}
  await db.pages.bulkUpdate(
    pages.map((p) => ({
      key: p.id,
      changes: { deleted_at: null, updated_at: t, dirty: 1 as const, ...(p.id === id ? detach : {}) },
    })),
  )
  schedulePush()
}

export async function purgePage(id: string) {
  const t = now()
  const pages = await subtree(id)
  await db.pages.bulkUpdate(
    pages.map((p) => ({
      key: p.id,
      changes: { purged: 1 as const, content: null, props: {}, title: '', updated_at: t, dirty: 1 as const },
    })),
  )
  schedulePush()
}

export async function movePage(id: string, parentId: string | null, beforeKey: string | null, afterKey: string | null) {
  await updatePage(id, { parent_id: parentId, sort_key: keyBetween(beforeKey, afterKey) })
}

/** Deep copy of a page (and its children/rows). Used by "Duplicar" and templates. */
export async function duplicatePage(
  id: string,
  overrides: Partial<Page> = {},
): Promise<Page | undefined> {
  const pages = await subtree(id)
  const root = pages[0]
  if (!root) return
  const idMap = new Map(pages.map((p) => [p.id, uid()]))
  const t = now()
  const copies = pages.map((p): Page => {
    const isRoot = p.id === id
    return {
      ...p,
      id: idMap.get(p.id)!,
      parent_id: p.parent_id && idMap.has(p.parent_id) ? idMap.get(p.parent_id)! : p.parent_id,
      database_id: p.database_id && idMap.has(p.database_id) ? idMap.get(p.database_id)! : p.database_id,
      created_at: t,
      updated_at: t,
      deleted_at: null,
      dirty: 1,
      ...(isRoot ? { is_template: 0 as const, ...overrides } : {}),
    }
  })
  if (!('sort_key' in overrides)) {
    copies[0].sort_key = keyAfter(await lastChildKey(copies[0].parent_id, copies[0].database_id))
  }
  // Views of any duplicated database.
  const views = await db.views.where('database_id').anyOf([...idMap.keys()]).toArray()
  await db.transaction('rw', db.pages, db.views, async () => {
    await db.pages.bulkAdd(copies)
    await db.views.bulkAdd(
      views.map((v) => ({ ...v, id: uid(), database_id: idMap.get(v.database_id)!, created_at: t, updated_at: t, dirty: 1 })),
    )
  })
  schedulePush()
  return copies[0]
}

// ---------- Databases ----------

export const STATUS_OPTIONS = [
  { id: 'todo', name: 'Por hacer', color: 'gray' as const },
  { id: 'doing', name: 'En progreso', color: 'blue' as const },
  { id: 'done', name: 'Hecho', color: 'green' as const },
]

export async function createDatabase(init: Partial<Page> = {}) {
  const schema: Property[] = [
    { id: uid(), name: 'Estado', type: 'status', options: STATUS_OPTIONS },
    { id: uid(), name: 'Fecha', type: 'date' },
  ]
  const page = await createPage({ kind: 'database', schema, ...init })
  await createView(page.id, { name: 'Tabla', type: 'table' })
  await createView(page.id, { name: 'Tablero', type: 'board', group_by: schema[0].id })
  return page
}

export async function createView(databaseId: string, init: Partial<View>) {
  const existing = await db.views.where('database_id').equals(databaseId).toArray()
  const view: View = {
    ...base(),
    database_id: databaseId,
    name: 'Vista',
    type: 'table',
    sort_key: keyAfter(existing.sort(bySortKey).at(-1)?.sort_key),
    group_by: null,
    filters: [],
    sorts: [],
    hidden: [],
    ...init,
  }
  await db.views.add(view)
  schedulePush()
  return view
}

export async function updateView(id: string, changes: Partial<View>) {
  await db.views.update(id, { ...changes, updated_at: now(), dirty: 1 })
  schedulePush()
}

export async function deleteView(id: string) {
  await updateView(id, { deleted_at: now() })
}

export async function updateSchema(databaseId: string, fn: (schema: Property[]) => Property[]) {
  const page = await db.pages.get(databaseId)
  if (!page) return
  await updatePage(databaseId, { schema: fn(page.schema ?? []) })
}

export function addRow(databaseId: string, props: Record<string, PropValue> = {}) {
  return createPage({ database_id: databaseId, parent_id: null, props })
}
