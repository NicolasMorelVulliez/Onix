import { gfetch } from './google'
import { buildRawMessage, header, type GmailHeader, type GmailPart, type OutgoingMail } from './mail'
import { uid } from './util'

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet: string
  internalDate: string
  payload: GmailPart & { headers: GmailHeader[] }
}

export interface ThreadSummary {
  id: string
  accountId: string
  subject: string
  from: string
  date: number
  snippet: string
  unread: boolean
  count: number
}

const post = (accountId: string, url: string, body: unknown) =>
  gfetch(accountId, url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

/** Threads matching a Gmail search (default: the inbox), newest first. */
export async function listThreads(accountId: string, q = 'in:inbox', pageToken?: string) {
  const params = new URLSearchParams({ q, maxResults: '25', ...(pageToken ? { pageToken } : {}) })
  const list = await gfetch<{ threads?: { id: string }[]; nextPageToken?: string }>(accountId, `${API}/threads?${params}`)
  const meta = new URLSearchParams({ format: 'metadata' })
  for (const h of ['From', 'Subject', 'Date']) meta.append('metadataHeaders', h)
  const threads = await Promise.all(
    (list.threads ?? []).map(async ({ id }): Promise<ThreadSummary> => {
      const t = await gfetch<{ messages: GmailMessage[] }>(accountId, `${API}/threads/${id}?${meta}`)
      const first = t.messages[0]
      const last = t.messages.at(-1)!
      return {
        id,
        accountId,
        subject: header(first.payload.headers, 'Subject') || '(Sin asunto)',
        from: header(last.payload.headers, 'From'),
        date: Number(last.internalDate),
        snippet: last.snippet,
        unread: t.messages.some((m) => m.labelIds?.includes('UNREAD')),
        count: t.messages.length,
      }
    }),
  )
  return { threads, nextPageToken: list.nextPageToken }
}

export async function getThread(accountId: string, id: string) {
  const t = await gfetch<{ messages: GmailMessage[] }>(accountId, `${API}/threads/${id}?format=full`)
  return t.messages
}

export function modifyThread(accountId: string, id: string, add: string[], remove: string[]) {
  return post(accountId, `${API}/threads/${id}/modify`, { addLabelIds: add, removeLabelIds: remove })
}

export const markRead = (accountId: string, id: string) => modifyThread(accountId, id, [], ['UNREAD'])
export const archive = (accountId: string, id: string) => modifyThread(accountId, id, [], ['INBOX'])

export function sendMail(accountId: string, mail: OutgoingMail, threadId?: string) {
  return post(accountId, `${API}/messages/send`, { raw: buildRawMessage(mail), ...(threadId ? { threadId } : {}) })
}

// ---------- Google Meet (through a Calendar event) ----------

export interface NewMeeting {
  title: string
  start: Date
  minutes: number
  guests: string[]
  description?: string
}

/** Creates an event in the account's main calendar with a Meet link and invites the guests. */
export async function createMeet(accountId: string, m: NewMeeting) {
  const end = new Date(m.start.getTime() + m.minutes * 60_000)
  const params = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: m.guests.length ? 'all' : 'none' })
  const event = await post(accountId, `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    summary: m.title,
    description: m.description,
    start: { dateTime: m.start.toISOString() },
    end: { dateTime: end.toISOString() },
    attendees: m.guests.map((email) => ({ email })),
    conferenceData: { createRequest: { requestId: uid(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
  })
  return event as { hangoutLink?: string; htmlLink: string }
}
