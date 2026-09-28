/**
 * Vercel Function: downloads a private iCal (.ics) link on behalf of the browser,
 * which can't fetch Google/Outlook calendars directly because of CORS.
 * The link travels in the POST body (not the query string) so it doesn't end up in logs.
 * Only calendar files are returned, so this can't be used as a general-purpose proxy.
 */
const MAX_BYTES = 10 * 1024 * 1024

function json(status: number, error: string) {
  return new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } })
}

export async function POST(request: Request): Promise<Response> {
  let url: URL
  try {
    const body = (await request.json()) as { url?: string }
    url = new URL(String(body.url).trim().replace(/^webcal:\/\//i, 'https://'))
  } catch {
    return json(400, 'Link inválido')
  }
  if (url.protocol !== 'https:' || /^[\d.]+$|^\[|^localhost$/i.test(url.hostname)) {
    return json(400, 'El link tiene que ser https://')
  }

  let res: Response
  try {
    res = await fetch(url, { headers: { accept: 'text/calendar' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) })
  } catch {
    return json(502, 'No se pudo conectar con el calendario')
  }
  if (!res.ok) return json(502, `El calendario respondió ${res.status}. ¿El link es correcto y sigue publicado?`)

  const text = await res.text()
  if (text.length > MAX_BYTES) return json(413, 'El calendario es demasiado grande')
  if (!text.trimStart().startsWith('BEGIN:VCALENDAR')) return json(422, 'El link no es un calendario iCal (.ics)')

  return new Response(text, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' } })
}
