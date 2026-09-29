/**
 * Called every 5 minutes by GitHub Actions (.github/workflows/notify.yml).
 * For each user with a subscribed device: builds the agenda, decides what to notify
 * (shared/notify.ts) and sends it, remembering what was already sent.
 */
import { DEFAULT_SETTINGS, plan, type NotifySettings } from '../../shared/notify.js'
import { adminDb, pushToUser } from '../_admin.js'
import { buildAgenda } from '../_agenda.js'
import { env } from '../_lib.js'

const KEEP_SENT_MS = 3 * 86_400_000

async function tick() {
  const db = adminDb()
  const now = new Date()
  const subs = await db.collectionGroup('push').get()
  const uids = [...new Set(subs.docs.map((d) => d.ref.parent.parent!.id))]
  const report: Record<string, unknown> = {}

  for (const uid of uids) {
    const settingsDoc = await db.doc(`users/${uid}/settings/notifications`).get()
    const settings: NotifySettings = settingsDoc.exists
      ? (JSON.parse(settingsDoc.get('data')).value as NotifySettings)
      : DEFAULT_SETTINGS('America/Argentina/Buenos_Aires')
    const stateRef = db.doc(`users/${uid}/server/state`)
    const sent: Record<string, number> = (await stateRef.get()).get('sent') ?? {}

    const { items, errors } = await buildAgenda(uid, settings, now)
    const planned = plan(settings, items, now, sent)
    for (const p of planned) {
      await pushToUser(uid, { title: p.title, body: p.body, url: p.url, tag: p.key })
      sent[p.key] = now.getTime()
    }
    const kept = Object.fromEntries(Object.entries(sent).filter(([, t]) => now.getTime() - t < KEEP_SENT_MS))
    await stateRef.set({ sent: kept, last_tick: now.toISOString(), errors }, { merge: false })
    report[uid] = { items: items.length, sent: planned.length, errors: errors.length }
  }
  return report
}

async function handler(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${env('CRON_SECRET')}`) {
    return new Response('No autorizado', { status: 401 })
  }
  try {
    return Response.json({ ok: true, users: await tick() })
  } catch (e) {
    console.error(e)
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export const GET = handler
export const POST = handler
