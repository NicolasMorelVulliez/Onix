/**
 * Quick capture from the Siri shortcut: POST { text } with "Authorization: Bearer <uid>.<secret>".
 * Creates a task in the user's task database; the app picks it up through the normal sync.
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { generateKeyBetween } from 'fractional-indexing'
import { localParts, zonedTime } from '../shared/notify.js'
import { parseQuickTask } from '../shared/quick-parse.js'
import { adminDb } from './_admin.js'

interface Prop {
  id: string
  type: string
  options?: { id: string; name: string }[]
}

const DONE = /^(done|hecho|hecha|completad[oa]|terminad[oa]|listo|lista|finalizad[oa])$/i
const say = (status: number, message: string) => Response.json({ ok: status < 300, message }, { status })

export async function POST(request: Request) {
  const [uid, secret] = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '').split('.')
  if (!uid || !secret || !/^[\w-]+$/.test(uid)) return say(401, 'Falta la clave del atajo')
  const db = adminDb()
  const config = await db.doc(`users/${uid}/server/quickadd`).get()
  const hash = createHash('sha256').update(secret).digest()
  const stored = Buffer.from(String(config.get('hash') ?? ''), 'hex')
  if (!config.exists || stored.length !== hash.length || !timingSafeEqual(stored, hash)) return say(401, 'La clave del atajo no es válida')

  const { text } = (await request.json().catch(() => ({}))) as { text?: string }
  if (!text?.trim()) return say(400, 'No dijiste qué agregar')

  const dbId = String(config.get('database_id'))
  const dbDoc = await db.doc(`users/${uid}/pages/${dbId}`).get()
  if (!dbDoc.exists) return say(404, 'No encontré tu base de Tareas. Abrí Onix y generá el atajo de nuevo.')
  const database = JSON.parse(dbDoc.get('data')) as { schema: Prop[] }
  const settings = await db.doc(`users/${uid}/settings/notifications`).get()
  const timeZone = settings.exists ? (JSON.parse(settings.get('data')).value?.timezone ?? 'America/Argentina/Buenos_Aires') : 'America/Argentina/Buenos_Aires'

  const now = new Date()
  const task = parseQuickTask(text, now, timeZone)
  const props: Record<string, unknown> = {}
  const dateProp = database.schema.find((p) => p.type === 'date')
  const statusProp = database.schema.find((p) => p.type === 'status')
  if (dateProp && task.date) props[dateProp.id] = { start: task.time ? zonedTime(task.date, task.time, timeZone).toISOString() : task.date }
  const open = statusProp?.options?.find((o) => o.id !== 'done' && !DONE.test(o.name))
  if (statusProp && open) props[statusProp.id] = open.id

  // New captures go first in the database.
  const rows = await db.collection(`users/${uid}/pages`).get()
  const keys = rows.docs
    .map((d) => JSON.parse(d.get('data')) as { database_id?: string; sort_key: string; deleted_at?: string | null })
    .filter((r) => r.database_id === dbId && !r.deleted_at)
    .map((r) => r.sort_key)
    .sort()
  const t = now.toISOString()
  const id = randomUUID()
  const row = {
    id,
    created_at: t,
    updated_at: t,
    deleted_at: null,
    purged: 0,
    parent_id: null,
    database_id: dbId,
    sort_key: generateKeyBetween(null, keys[0] ?? null),
    title: task.title,
    icon: null,
    kind: 'page',
    content: null,
    schema: null,
    props,
    is_template: 0,
  }
  await db.doc(`users/${uid}/pages/${id}`).set({ updated_at: t, data: JSON.stringify(row), server_updated_at: FieldValue.serverTimestamp() })

  const when = task.date
    ? ` para ${task.date === localParts(now, timeZone).date ? 'hoy' : new Date(`${task.date}T12:00:00Z`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}${task.time ? ` a las ${task.time}` : ''}`
    : ''
  return say(200, `Listo: "${task.title}"${when}.`)
}
