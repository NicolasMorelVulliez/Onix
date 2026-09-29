import { env, GOOGLE_SCOPES, handle, HttpError, isAllowedOrigin, json, preflight, requireUser, signState } from '../_lib.js'

/** Returns the Google consent URL to link one more account to the signed-in user. */
export async function POST(request: Request) {
  return handle(request, async () => {
    const uid = await requireUser(request)
    const { returnTo, loginHint } = (await request.json()) as { returnTo?: string; loginHint?: string }
    if (!returnTo || !isAllowedOrigin(new URL(returnTo).origin)) throw new HttpError(400, 'Origen no permitido')

    const redirectUri = `${new URL(request.url).origin}/api/google/callback`
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.search = new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      // Always show the account chooser and return a refresh token.
      prompt: 'select_account consent',
      include_granted_scopes: 'true',
      state: await signState({ uid, returnTo, redirectUri }),
      // Re-granting permissions for an account already linked: preselect it.
      ...(loginHint ? { login_hint: loginHint } : {}),
    }).toString()
    return json(request, 200, { url: url.toString() })
  })
}

export const OPTIONS = preflight
