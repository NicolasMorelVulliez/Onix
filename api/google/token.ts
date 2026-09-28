import { decryptToken, googleToken, handle, HttpError, json, preflight, requireUser } from '../_lib.js'

/** Trades a linked account's encrypted refresh token for a 1-hour access token. */
export async function POST(request: Request) {
  return handle(request, async () => {
    const uid = await requireUser(request)
    const { token } = (await request.json()) as { token?: string }
    const data = await decryptToken(token ?? '').catch(() => {
      throw new HttpError(400, 'Token inválido')
    })
    if (data.uid !== uid) throw new HttpError(403, 'Esta cuenta pertenece a otro usuario')
    const res = await googleToken({ grant_type: 'refresh_token', refresh_token: data.refresh_token }).catch((e) => {
      // Revoked or expired: the user has to link the account again.
      if (e instanceof HttpError && e.status === 401) throw new HttpError(401, 'reauth')
      throw e
    })
    return json(request, 200, { access_token: res.access_token, expires_in: res.expires_in })
  })
}

export const OPTIONS = preflight
