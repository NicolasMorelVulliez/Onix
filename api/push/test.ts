import { pushToUser } from '../_admin.js'
import { handle, json, preflight, requireMember } from '../_lib.js'

/** Sends a test notification to every device signed in to Onix. */
export async function POST(request: Request) {
  return handle(request, async () => {
    const uid = await requireMember(request)
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
