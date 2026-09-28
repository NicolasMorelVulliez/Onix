import { decodeJwt } from 'jose'
import { encryptToken, googleToken, verifyState } from '../_lib.js'

/**
 * Google redirects here after consent. Exchanges the code for a refresh token and sends
 * the browser back to the app with the account info in the URL fragment (never sent to servers).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  let state: Record<string, string>
  try {
    state = await verifyState(params.get('state') ?? '')
  } catch {
    return new Response('El link de vinculación venció. Volvé a intentarlo desde la app.', { status: 400 })
  }
  const back = (fragment: Record<string, string>) =>
    Response.redirect(`${state.returnTo}/accounts#${new URLSearchParams(fragment)}`, 302)

  if (params.get('error')) return back({ error: params.get('error')! })
  try {
    const tokens = await googleToken({
      grant_type: 'authorization_code',
      code: params.get('code') ?? '',
      redirect_uri: state.redirectUri,
    })
    if (!tokens.refresh_token) return back({ error: 'Google no devolvió permiso offline. Quitá el acceso de la app en tu cuenta de Google y reintentá.' })
    // The id_token comes straight from Google over TLS, so decoding without verifying is fine here.
    const profile = decodeJwt(String(tokens.id_token))
    return back({
      sub: String(profile.sub),
      email: String(profile.email),
      name: String(profile.name ?? profile.email),
      picture: String(profile.picture ?? ''),
      token: await encryptToken({ uid: state.uid, refresh_token: String(tokens.refresh_token) }),
    })
  } catch (e) {
    return back({ error: e instanceof Error ? e.message : 'No se pudo vincular la cuenta' })
  }
}
