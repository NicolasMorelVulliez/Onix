/** Server-side Firestore access (Firebase Admin), for the notification jobs. */
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import webpush from 'web-push'
import { env } from './_lib.js'

export function adminDb() {
  if (!getApps().length) {
    const account = JSON.parse(Buffer.from(env('FIREBASE_SERVICE_ACCOUNT'), 'base64').toString('utf8'))
    initializeApp({ credential: cert(account) })
  }
  return getFirestore()
}

/** Rows of a synced table (the app stores each row as JSON in `data`). */
export async function readRows<T extends { deleted_at?: string | null; purged?: number }>(uid: string, table: string) {
  const snap = await adminDb().collection(`users/${uid}/${table}`).get()
  return snap.docs.map((d) => JSON.parse(d.get('data')) as T).filter((r) => !r.deleted_at && !r.purged)
}

export interface PushSub {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

let vapidReady = false

/** Sends one notification to every device of the user; forgets devices that unsubscribed. */
export async function pushToUser(uid: string, payload: { title: string; body: string; url: string; tag?: string }) {
  if (!vapidReady) {
    webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
    vapidReady = true
  }
  const subs = await adminDb().collection(`users/${uid}/push`).get()
  let delivered = 0
  await Promise.all(
    subs.docs.map(async (d) => {
      try {
        await webpush.sendNotification(d.data() as PushSub, JSON.stringify(payload), { TTL: 3600 })
        delivered++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) await d.ref.delete()
        else console.error('push', status, e)
      }
    }),
  )
  return delivered
}
