/**
 * Subjects (materias): a page linked to its Drive folder with a "Clases" database whose rows
 * are dated classes, each linked to its own Drive folder with a "Grabaciones" subfolder.
 */
import { generateNKeysBetween } from 'fractional-indexing'
import { combine } from './dates'
import { db } from './db'
import { ensureFolder } from './google'
import { createPage, createView, updatePage } from './pages'
import type { CalendarCategory, DriveLink, Page, Property } from './types'
import { now, uid } from './util'

export interface ClassSlot {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number
  from: string // HH:MM
  to: string
}

export interface PlannedClass {
  date: string // yyyy-mm-dd
  from: string
  to: string
  topic: string
  kind: ClassKind
  /** What to review before (filled by the AI cronograma reader). */
  prep?: string
}

export type ClassKind = 'clase' | 'parcial' | 'tp' | 'recuperatorio' | 'final' | 'feriado'

export const KINDS: { id: ClassKind; name: string; color: 'gray' | 'blue' | 'red' | 'orange' | 'purple' | 'green' }[] = [
  { id: 'clase', name: 'Clase', color: 'blue' },
  { id: 'parcial', name: 'Parcial', color: 'red' },
  { id: 'tp', name: 'Entrega TP', color: 'orange' },
  { id: 'recuperatorio', name: 'Recuperatorio', color: 'purple' },
  { id: 'final', name: 'Final', color: 'red' },
  { id: 'feriado', name: 'Sin clase', color: 'gray' },
]

/** Every class between two dates on the given weekdays and times. */
export function generateClasses(slots: ClassSlot[], start: string, end: string): PlannedClass[] {
  const out: PlannedClass[] = []
  const d = new Date(`${start}T12:00:00Z`)
  const last = new Date(`${end}T12:00:00Z`)
  for (; d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    for (const s of slots.filter((x) => x.weekday === d.getUTCDay())) {
      out.push({ date: d.toISOString().slice(0, 10), from: s.from, to: s.to, topic: '', kind: 'clase' })
    }
  }
  return out
}

/** "Clase 3 - 23 05", like the user's Notion and Drive folders. Non-class items keep their kind. */
export function className(c: PlannedClass, n: number) {
  const [, m, day] = c.date.split('-')
  const label = c.kind === 'clase' ? `Clase ${n}` : KINDS.find((k) => k.id === c.kind)!.name
  return `${label} - ${day} ${m}`
}

/** Numbers only real classes (parciales, feriados… don't count). */
export function numbered(classes: PlannedClass[]) {
  let n = 0
  return [...classes]
    .sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from))
    .map((c) => ({ ...c, ref: c, title: className(c, c.kind === 'clase' ? ++n : n) }))
}

export interface NewSubject {
  parentId: string | null
  name: string
  classes: PlannedClass[]
  category: CalendarCategory
  /** Where to create (or find) the subject folder in Drive. */
  drive: { accountId: string; parentFolderId: string } | null
}

/** Creates the subject page, its "Clases" database, the class rows and the Drive folders. */
export async function createSubject(s: NewSubject, onProgress: (done: number, total: number, label: string) => void) {
  const list = numbered(s.classes)
  const total = list.length + 2
  let done = 0
  const step = (label: string) => onProgress(++done, total, label)

  let subjectFolder: DriveLink | null = null
  if (s.drive) {
    const f = await ensureFolder(s.drive.accountId, s.drive.parentFolderId, s.name)
    subjectFolder = { accountId: s.drive.accountId, folderId: f.id, name: f.name }
  }
  const subject = await createPage({ parent_id: s.parentId, title: s.name, icon: '📘', drive: subjectFolder })
  step('Materia creada')

  const topic: Property = { id: uid(), name: 'Tema', type: 'text' }
  const date: Property = { id: uid(), name: 'Fecha', type: 'date' }
  const kind: Property = { id: uid(), name: 'Tipo', type: 'select', options: KINDS.map((k) => ({ id: k.id, name: k.name, color: k.color })) }
  const prep: Property = { id: uid(), name: 'Para preparar', type: 'text' }
  const classesDb = await createPage({
    parent_id: subject.id,
    title: 'Clases',
    icon: '🗓️',
    kind: 'database',
    schema: [date, topic, kind, prep],
    calendar_category: s.category,
  })
  await createView(classesDb.id, { name: 'Cronograma', type: 'table', sorts: [{ prop: date.id, dir: 'asc' }] })
  await createView(classesDb.id, { name: 'Por tipo', type: 'board', group_by: kind.id })
  step('Cronograma creado')

  const keys = generateNKeysBetween(null, null, Math.max(list.length, 1))
  for (const [i, c] of list.entries()) {
    let folder: DriveLink | null = null
    if (s.drive && subjectFolder && c.kind !== 'feriado') {
      const f = await ensureFolder(s.drive.accountId, subjectFolder.folderId, c.title)
      await ensureFolder(s.drive.accountId, f.id, 'Grabaciones')
      folder = { accountId: s.drive.accountId, folderId: f.id, name: f.name }
    }
    const t = now()
    await db.pages.add({
      id: uid(),
      created_at: t,
      updated_at: t,
      deleted_at: null,
      purged: 0,
      dirty: 1,
      parent_id: null,
      database_id: classesDb.id,
      sort_key: keys[i],
      title: c.title,
      icon: null,
      kind: 'page',
      content: null,
      schema: null,
      is_template: 0,
      drive: folder,
      props: {
        [date.id]: { start: combine(c.date, c.from), end: combine(c.date, c.to) },
        [kind.id]: c.kind,
        ...(c.topic ? { [topic.id]: c.topic } : {}),
        ...(c.prep ? { [prep.id]: c.prep } : {}),
      },
    } as Page)
    step(c.title)
  }
  await updatePage(subject.id, {
    content: [
      { id: uid(), type: 'paragraph', props: {}, content: [{ type: 'text', text: 'Las clases, parciales y entregas están en el cronograma de abajo y en el Calendario.', styles: {} }], children: [] },
      { id: uid(), type: 'pageLink', props: { pageId: classesDb.id }, children: [] },
    ] as unknown as Page['content'],
  })
  return subject
}

