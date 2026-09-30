import { useLiveQuery } from 'dexie-react-hooks'
import { deleteDoc, doc, setDoc } from 'firebase/firestore'
import { useEffect } from 'react'
import { DEFAULT_SETTINGS, type AgendaItem, type NotifySettings } from '../../shared/notify'
import { OWNER } from './access'
import { loadClassEvents } from './classes'
import { db } from './db'
import { API_URL, auth, firestore } from './firebase'
import { schedulePush } from './sync'
import type { AppSetting, DateValue } from './types'
import { now } from './util'

const ID = 'notifications'
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

// ---------- Settings (synced like any other row) ----------

export function useNotifySettings(): NotifySettings | undefined {
  return useLiveQuery(async () => {
    const row = (await db.settings.get(ID)) as AppSetting<NotifySettings> | undefined
    return row?.value ?? DEFAULT_SETTINGS(timezone())
  }, [])
}

export async function saveNotifySettings(value: NotifySettings) {
  const t = now()
  const existing = await db.settings.get(ID)
  await db.settings.put({
    id: ID,
    created_at: existing?.created_at ?? t,
    updated_at: t,
    deleted_at: null,
    purged: 0,
    dirty: 1,
    value: { ...value, timezone: timezone() },
  })
  schedulePush()
}

// ---------- This device ----------

export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID
}

export async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

const subId = async (endpoint: string) => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))
  return [...new Uint8Array(hash)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const keyBytes = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

/** Asks for permission and registers this device for notifications. */
export async function enablePush() {
  const user = auth?.currentUser
  if (!user || !firestore) throw new Error('Iniciá sesión primero')
  if ((await Notification.requestPermission()) !== 'granted') {
    throw new Error('No diste permiso. Activalo en Ajustes → Notificaciones → Onix.')
  }
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID!) }))
  const json = sub.toJSON()
  await setDoc(doc(firestore, 'users', OWNER, 'push', await subId(sub.endpoint)), {
    endpoint: json.endpoint,
    keys: json.keys,
    device: isIOS() ? 'iPhone / iPad' : navigator.platform || 'Navegador',
    created_at: now(),
  })
}

export async function disablePush() {
  const sub = await currentSubscription()
  const user = auth?.currentUser
  if (!sub || !user || !firestore) return
  await deleteDoc(doc(firestore, 'users', OWNER, 'push', await subId(sub.endpoint)))
  await sub.unsubscribe()
}

export async function sendTestPush() {
  const token = await auth!.currentUser!.getIdToken()
  const res = await fetch(`${API_URL}/api/push/test`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })
  const body = (await res.json()) as { delivered?: number; error?: string }
  if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
  return body.delivered ?? 0
}

// ---------- Tasks the server should know about ----------

/**
 * Keeps users/{space}/server/tasks with the database rows that have a date, so the server can
 * remind them without reading every page (Firestore's free plan counts each read).
 */
export function useTaskSnapshot(uid: string | undefined) {
  const items = useLiveQuery(async () => {
    const dbs = await db.pages.filter((p) => p.kind === 'database' && !p.calendar_category && !p.deleted_at && !p.purged).toArray()
    const dateProp = new Map<string, string>()
    for (const d of dbs) {
      const prop = d.schema?.find((p) => p.type === 'date')
      if (prop) dateProp.set(d.id, prop.id)
    }
    const rows = await db.pages
      .where('database_id')
      .anyOf([...dateProp.keys()])
      .filter((r) => !r.deleted_at && !r.purged && !r.is_template)
      .toArray()
    const since = Date.now() - 2 * 86_400_000
    const classes = (await loadClassEvents()).map(
      (c): AgendaItem => ({
        id: c.page.id,
        kind: 'event',
        title: c.subject ? `${c.subject.title} · ${c.page.title}` : c.page.title,
        start: c.start,
        allDay: c.start.length === 10,
        category: c.category,
        location: c.prep ? `Antes: ${c.prep}` : c.topic,
        url: `/p/${c.page.id}`,
      }),
    )
    return [...rows
      .flatMap((r): AgendaItem[] => {
        const v = r.props[dateProp.get(r.database_id!)!] as DateValue | null
        if (!v?.start) return []
        return [{ id: r.id, kind: 'task', title: r.title || 'Sin título', start: v.start, allDay: v.start.length === 10, url: `/p/${r.id}` }]
      }), ...classes]
      .filter((t) => new Date(t.allDay ? `${t.start}T23:59:59` : t.start).getTime() >= since)
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 500)
  }, [])

  const json = items ? JSON.stringify(items) : null
  useEffect(() => {
    if (!uid || !firestore || json === null) return
    const t = setTimeout(() => {
      setDoc(doc(firestore!, 'users', uid, 'server', 'tasks'), { items: JSON.parse(json), updated_at: now() }).catch(console.error)
    }, 3000)
    return () => clearTimeout(t)
  }, [uid, json])
}
