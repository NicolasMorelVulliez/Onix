import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { create } from 'zustand'
import { db, getMeta, setMeta, SYNCED_TABLES, type SyncedTable } from './db'
import { firestore } from './firebase'
import { fromRemote, shouldApplyRemote, toRemote } from './merge'
import type { Syncable } from './types'

type Status = 'local' | 'idle' | 'syncing' | 'offline' | 'error'

export const useSyncStatus = create<{ status: Status; error: string | null }>(() => ({
  status: firestore ? 'idle' : 'local',
  error: null,
}))

const set = (status: Status, error: string | null = null) => useSyncStatus.setState({ status, error })

let userId: string | null = null
let pushing: Promise<void> | null = null
let again = false

/** users/{uid}/{table} */
const col = (table: SyncedTable) => collection(firestore!, 'users', userId!, table)

async function pushTable(table: SyncedTable) {
  const rows = (await db[table].where('dirty').equals(1).toArray()) as Syncable[]
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400)
    const batch = writeBatch(firestore!)
    for (const r of chunk) batch.set(doc(col(table), r.id), { ...toRemote(r), server_updated_at: serverTimestamp() })
    await batch.commit()
    // Clear the flag only if the row wasn't edited again while pushing.
    await db.transaction('rw', db[table], async () => {
      for (const r of chunk) {
        const cur = (await db[table].get(r.id)) as Syncable | undefined
        if (cur && cur.updated_at === r.updated_at) await db[table].update(r.id, { dirty: 0 })
      }
    })
  }
}

async function push() {
  if (!firestore || !userId) return
  if (!navigator.onLine) return set('offline')
  set('syncing')
  try {
    for (const t of SYNCED_TABLES) await pushTable(t)
    set('idle')
  } catch (e) {
    console.error('sync', e)
    set('error', e instanceof Error ? e.message : String(e))
  }
}

export function syncNow(): Promise<void> {
  if (pushing) {
    again = true
    return pushing
  }
  pushing = push().finally(() => {
    pushing = null
    if (again) {
      again = false
      syncNow()
    }
  })
  return pushing
}

let pushTimer: ReturnType<typeof setTimeout> | undefined
/** Batches edits: Firestore's free tier allows 20k writes a day. */
export function schedulePush() {
  if (!firestore) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(syncNow, 2000)
}

/** Live pull: listens to every row changed after the last one we saw. */
async function listen(table: SyncedTable) {
  const cursorKey = `cursor:${table}`
  const cursor = Number((await getMeta(cursorKey)) ?? 0)
  const q = query(col(table), where('server_updated_at', '>', Timestamp.fromMillis(cursor)), orderBy('server_updated_at'))
  return onSnapshot(
    q,
    async (snap) => {
      // Our own writes come back first with a pending server timestamp; skip until confirmed.
      const changes = snap.docChanges().filter((c) => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites)
      if (!changes.length) return
      let max = cursor
      await db.transaction('rw', db[table], async () => {
        for (const c of changes) {
          const data = c.doc.data()
          const remote = fromRemote(data as { data: string })
          const local = (await db[table].get(remote.id)) as Syncable | undefined
          if (shouldApplyRemote(local, remote)) await db[table].put(remote as never)
          max = Math.max(max, (data.server_updated_at as Timestamp).toMillis())
        }
      })
      await setMeta(cursorKey, String(max))
    },
    (e) => set('error', e.message),
  )
}

/** Starts background sync for the signed-in user. Returns a cleanup function. */
export function startSync(uid: string) {
  if (!firestore) return () => {}
  userId = uid
  syncNow()
  const unsubs = Promise.all(SYNCED_TABLES.map(listen))
  const onOnline = () => syncNow()
  window.addEventListener('online', onOnline)
  return () => {
    userId = null
    unsubs.then((fns) => fns.forEach((f) => f()))
    window.removeEventListener('online', onOnline)
  }
}
