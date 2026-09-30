/**
 * Vercel Function: downloads a private iCal (.ics) link on behalf of the browser,
 * which can't fetch Outlook/Google calendar files directly because of CORS.
 * The link travels in the POST body (not the query string) so it doesn't end up in logs.
 * Only calendar files are returned, and only to Onix's accounts, so it isn't an open proxy.
 */
import { handle, json, preflight, requireMember, withCors } from './_lib.js'

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: Request): Promise<Response> {
  return handle(request, async () => {
    // Only for Onix's own accounts: otherwise anyone could download things through it.
    await requireMember(request)
    let url: URL
    try {
      const body = (await request.json()) as { url?: string }
      url = new URL(String(body.url).trim().replace(/^webcal:\/\//i, 'https://'))
    } catch {
      return json(request, 400, { error: 'Link inválido' })
    }
    if (url.protocol !== 'https:' || /^[\d.]+$|^\[|^localhost$/i.test(url.hostname)) {
      return json(request, 400, { error: 'El link tiene que ser https://' })
    }

    let res: Response
    try {
      res = await fetch(url, { headers: { accept: 'text/calendar' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) })
    } catch {
      return json(request, 502, { error: 'No se pudo conectar con el calendario' })
    }
    if (!res.ok) return json(request, 502, { error: `El calendario respondió ${res.status}. ¿El link es correcto y sigue publicado?` })

    const text = await res.text()
    if (text.length > MAX_BYTES) return json(request, 413, { error: 'El calendario es demasiado grande' })
    if (!text.trimStart().startsWith('BEGIN:VCALENDAR')) return json(request, 422, { error: 'El link no es un calendario iCal (.ics)' })

    return withCors(request, new Response(text, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' } }))
  })
}

export const OPTIONS = preflight
