import { pushToUser } from '../_admin.js'
import { handle, json, preflight, requireUser } from '../_lib.js'

/** Sends a test notification to every device of the signed-in user. */
export async function POST(request: Request) {
  return handle(request, async () => {
    const uid = await requireUser(request)
    const delivered = await pushToUser(uid, {
      title: 'Onix',
      body: 'Las notificaciones funcionan en este dispositivo ✅',
      url: '/notifications',
      tag: 'test',
    })
    return json(request, 200, { delivered })
  })
}

export const OPTIONS = preflight
