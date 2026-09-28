import { create } from 'zustand'
import { db, getMeta, setMeta, SYNCED_TABLES, type SyncedTable } from './db'
import { fromRemote, shouldApplyRemote, toRemote } from './merge'
import { supabase } from './supabase'
import type { Syncable } from './types'

type Status = 'local' | 'idle' | 'syncing' | 'offline' | 'error'

export const useSyncStatus = create<{ status: Status; error: string | null }>(() => ({
  status: supabase ? 'idle' : 'local',
  error: null,
}))

const set = (status: Status, error: string | null = null) => useSyncStatus.setState({ status, error })

let userId: string | null = null
let running: Promise<void> | null = null
let again = false

async function push(table: SyncedTable) {
  const rows = (await db[table].where('dirty').equals(1).toArray()) as Syncable[]
  if (!rows.length) return
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    const { error } = await supabase!.from(table).upsert(chunk.map((r) => toRemote(r, userId!)))
    if (error) throw error
    // Clear the flag only if the row wasn't edited again while pushing.
    await db.transaction('rw', db[table], async () => {
      for (const r of chunk) {
        const cur = (await db[table].get(r.id)) as Syncable | undefined
        if (cur && cur.updated_at === r.updated_at) await db[table].update(r.id, { dirty: 0 })
      }
    })
  }
}

async function pull(table: SyncedTable) {
  const cursorKey = `cursor:${table}`
  let cursor = (await getMeta(cursorKey)) ?? '1970-01-01T00:00:00Z'
  for (;;) {
    const { data, error } = await supabase!
      .from(table)
      .select('*')
      .gt('server_updated_at', cursor)
      .order('server_updated_at')
      .limit(500)
    if (error) throw error
    if (!data.length) break
    await db.transaction('rw', db[table], async () => {
      for (const raw of data) {
        const remote = fromRemote(raw)
        const local = (await db[table].get(remote.id)) as Syncable | undefined
        if (shouldApplyRemote(local, remote)) await db[table].put(remote as never)
      }
    })
    cursor = data.at(-1)!.server_updated_at
    await setMeta(cursorKey, cursor)
    if (data.length < 500) break
  }
}

async function run() {
  if (!supabase || !userId) return
  if (!navigator.onLine) return set('offline')
  set('syncing')
  try {
    for (const t of SYNCED_TABLES) await push(t)
    for (const t of SYNCED_TABLES) await pull(t)
    set('idle')
  } catch (e) {
    console.error('sync', e)
    set('error', e instanceof Error ? e.message : String(e))
  }
}

export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = run().finally(() => {
    running = null
    if (again) {
      again = false
      syncNow()
    }
  })
  return running
}

let pushTimer: ReturnType<typeof setTimeout> | undefined
export function schedulePush() {
  if (!supabase) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(syncNow, 800)
}

/** Starts background sync for the signed-in user. Returns a cleanup function. */
export function startSync(uid: string) {
  if (!supabase) return () => {}
  userId = uid
  syncNow()
  const channel = supabase
    .channel('changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pages' }, () => schedulePush())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'views' }, () => schedulePush())
    .subscribe()
  const onOnline = () => syncNow()
  const onVisible = () => document.visibilityState === 'visible' && syncNow()
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  const interval = setInterval(syncNow, 60_000)
  return () => {
    userId = null
    supabase!.removeChannel(channel)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(interval)
  }
}
