/** Gmail message helpers: build outgoing MIME messages and read incoming ones. */

export interface GmailHeader {
  name: string
  value: string
}

export interface GmailPart {
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: GmailPart[]
}

export interface OutgoingMail {
  from: string
  to: string
  cc?: string
  subject: string
  body: string
  inReplyTo?: string
  references?: string
}

const utf8ToBase64 = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export const toBase64Url = (s: string) => utf8ToBase64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function fromBase64Url(data: string) {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/** RFC 2047 encoded-word so accents and emojis survive in headers. */
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${utf8ToBase64(s)}?=`)

/** Raw RFC 2822 message, base64url-encoded, ready for users.messages.send. */
export function buildRawMessage(m: OutgoingMail) {
  const lines = [
    `From: ${m.from}`,
    `To: ${m.to}`,
    ...(m.cc ? [`Cc: ${m.cc}`] : []),
    `Subject: ${encodeHeader(m.subject)}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${m.references ?? m.inReplyTo}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    utf8ToBase64(m.body).replace(/.{76}/g, '$&\r\n'),
  ]
  return toBase64Url(lines.join('\r\n'))
}

export const header = (headers: GmailHeader[] | undefined, name: string) =>
  headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

/** Picks the best body of a message: HTML if there is one, else plain text. */
export function extractBody(part: GmailPart): { html: string } | { text: string } {
  let html: string | null = null
  let text: string | null = null
  const walk = (p: GmailPart) => {
    if (p.filename) return // attachments
    if (p.body?.data) {
      if (p.mimeType === 'text/html' && html === null) html = fromBase64Url(p.body.data)
      else if (p.mimeType === 'text/plain' && text === null) text = fromBase64Url(p.body.data)
    }
    p.parts?.forEach(walk)
  }
  walk(part)
  return html !== null ? { html } : { text: text ?? '' }
}

export function attachments(part: GmailPart): { filename: string; size: number }[] {
  const out: { filename: string; size: number }[] = []
  const walk = (p: GmailPart) => {
    if (p.filename && p.body?.attachmentId) out.push({ filename: p.filename, size: p.body.size ?? 0 })
    p.parts?.forEach(walk)
  }
  walk(part)
  return out
}

/** "Juan Pérez <juan@x.com>" -> "Juan Pérez" */
export function senderName(from: string) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<.*>\s*$/)
  return (m?.[1] || from).trim()
}

/** Short date for lists: time today, "12 oct" this year, else with the year. */
export function mailDate(ms: number, now = Date.now()) {
  const d = new Date(ms)
  const today = new Date(now)
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  if (d.getFullYear() === today.getFullYear()) return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}
