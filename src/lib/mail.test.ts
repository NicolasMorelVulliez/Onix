import { describe, expect, it } from 'vitest'
import { buildRawMessage, extractBody, fromBase64Url, senderName, toBase64Url } from './mail'

describe('mail', () => {
  it('builds a UTF-8 message Gmail can send', () => {
    const raw = fromBase64Url(
      buildRawMessage({ from: 'yo@gmail.com', to: 'vos@egs.com', subject: 'Reunión ✅', body: 'Hola, ¿cómo va?' }),
    )
    expect(raw).toContain('To: vos@egs.com')
    expect(raw).toMatch(/Subject: =\?UTF-8\?B\?.+\?=/)
    const body = raw.split('\r\n\r\n')[1]
    expect(new TextDecoder().decode(Uint8Array.from(atob(body.replace(/\r\n/g, '')), (c) => c.charCodeAt(0)))).toBe('Hola, ¿cómo va?')
  })

  it('adds threading headers to replies', () => {
    const raw = fromBase64Url(buildRawMessage({ from: 'a@x', to: 'b@x', subject: 'Re: hi', body: 'ok', inReplyTo: '<id@x>' }))
    expect(raw).toContain('In-Reply-To: <id@x>')
    expect(raw).toContain('References: <id@x>')
  })

  it('prefers the HTML body and skips attachments', () => {
    const part = {
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'multipart/alternative', parts: [
          { mimeType: 'text/plain', body: { data: toBase64Url('hola') } },
          { mimeType: 'text/html', body: { data: toBase64Url('<b>hola</b>') } },
        ] },
        { mimeType: 'text/html', filename: 'adjunto.html', body: { attachmentId: 'a1', data: toBase64Url('<i>no</i>') } },
      ],
    }
    expect(extractBody(part)).toEqual({ html: '<b>hola</b>' })
    expect(extractBody({ mimeType: 'text/plain', body: { data: toBase64Url('solo texto') } })).toEqual({ text: 'solo texto' })
  })

  it('reads the sender name', () => {
    expect(senderName('"Juan Pérez" <juan@x.com>')).toBe('Juan Pérez')
    expect(senderName('juan@x.com')).toBe('juan@x.com')
  })
})
