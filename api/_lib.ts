/**
 * Shared helpers for the Vercel functions (files starting with "_" aren't routes).
 *
 * Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_SECRET (32+ random chars),
 * FIREBASE_PROJECT_ID, APP_ORIGINS (comma-separated, e.g. https://onix.web.app).
 */
import { compactDecrypt, CompactEncrypt, createRemoteJWKSet, jwtVerify, SignJWT } from 'jose'

export const env = (name: string) => {
  const v = process.env[name]
  if (!v) throw new Error(`Falta la variable de entorno ${name}`)
  return v
}

const allowedOrigins = () => (process.env.APP_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

export function isAllowedOrigin(origin: string | null) {
  if (!origin) return false
  return allowedOrigins().includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin')
  if (!isAllowedOrigin(origin)) return {}
  return {
    'access-control-allow-origin': origin!,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    vary: 'origin',
  }
}

export function json(request: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...corsHeaders(request) },
  })
}

export function withCors(request: Request, response: Response) {
  for (const [k, v] of Object.entries(corsHeaders(request))) response.headers.set(k, v)
  return response
}

export const preflight = (request: Request) => new Response(null, { status: 204, headers: corsHeaders(request) })

// ---------- Firebase ID tokens (who is calling) ----------

const firebaseKeys = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

/** Returns the Firebase uid of the signed-in user making the request. */
export async function requireUser(request: Request): Promise<string> {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) throw new HttpError(401, 'Falta iniciar sesión')
  const project = env('FIREBASE_PROJECT_ID')
  try {
    const { payload } = await jwtVerify(token, firebaseKeys, {
      issuer: `https://securetoken.google.com/${project}`,
      audience: project,
    })
    return payload.sub!
  } catch {
    throw new HttpError(401, 'Sesión inválida o vencida')
  }
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Runs a handler, turning thrown HttpErrors into JSON responses. */
export async function handle(request: Request, fn: () => Promise<Response>) {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof HttpError) return json(request, e.status, { error: e.message })
    console.error(e)
    return json(request, 500, { error: e instanceof Error ? e.message : 'Error interno' })
  }
}

// ---------- Secrets: signed OAuth state and encrypted refresh tokens ----------

const secret = () => new TextEncoder().encode(env('TOKEN_SECRET').padEnd(32, '#').slice(0, 32))

export async function signState(payload: Record<string, string>) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('10m').sign(secret())
}

export async function verifyState(state: string) {
  const { payload } = await jwtVerify(state, secret())
  return payload as Record<string, string>
}

/** The refresh token never reaches the browser in clear: only this ciphertext does. */
export async function encryptToken(data: { uid: string; refresh_token: string }) {
  return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(data)))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(secret())
}

export async function decryptToken(jwe: string): Promise<{ uid: string; refresh_token: string }> {
  const { plaintext } = await compactDecrypt(jwe, secret())
  return JSON.parse(new TextDecoder().decode(plaintext))
}

// ---------- Google OAuth ----------

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.readonly',
  // Read, send, archive and mark mail as read (everything except permanent deletion).
  'https://www.googleapis.com/auth/gmail.modify',
]

export async function googleToken(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), ...params }),
  })
  const body = (await res.json()) as Record<string, string | number>
  if (!res.ok) throw new HttpError(res.status === 400 ? 401 : 502, String(body.error ?? 'Error de Google'))
  return body
}
