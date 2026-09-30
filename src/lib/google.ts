import { db } from './db'
import { API_URL, auth } from './firebase'
import { schedulePush } from './sync'
import type { CalendarCategory, CalendarEvent, GoogleAccount } from './types'
import { now } from './util'

// ---------- Linking accounts ----------

async function idToken() {
  const user = auth?.currentUser
  if (!user) throw new Error('Iniciá sesión para vincular cuentas de Google')
  return user.getIdToken()
}

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await idToken()}` },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
  return data
}

/** Sends the browser to Google's account chooser; it comes back to /accounts. */
export async function startLinkGoogle(loginHint?: string) {
  const { url } = await api<{ url: string }>('/api/google/start', { returnTo: window.location.origin, loginHint })
  window.location.href = url
}

/** Reads the result that /api/google/callback left in the URL fragment. */
export async function finishLinkGoogle(hash: string): Promise<GoogleAccount | { error: string } | null> {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  if (p.get('error')) return { error: p.get('error')! }
  if (!p.get('token') || !p.get('sub')) return null
  const t = now()
  const existing = await db.google_accounts.get(p.get('sub')!)
  const account: GoogleAccount = {
    id: p.get('sub')!,
    created_at: existing?.created_at ?? t,
    updated_at: t,
    deleted_at: null,
    purged: 0,
    dirty: 1,
    email: p.get('email')!,
    name: p.get('name')!,
    picture: p.get('picture') ?? '',
    token: p.get('token')!,
    category: existing?.category ?? 'personal',
    needs_reauth: 0,
    scopes: p.get('scopes') ?? '',
  }
  await db.google_accounts.put(account)
  tokens.delete(account.id)
  schedulePush()
  return account
}

export async function unlinkGoogle(accountId: string) {
  const t = now()
  await db.google_accounts.update(accountId, { deleted_at: t, purged: 1, token: '', updated_at: t, dirty: 1 })
  const sources = await db.calendar_sources.filter((s) => s.account_id === accountId && !s.deleted_at).toArray()
  for (const s of sources) {
    await db.calendar_sources.update(s.id, { deleted_at: t, purged: 1, updated_at: t, dirty: 1 })
    await db.events.where('source_id').equals(s.id).delete()
  }
  schedulePush()
}

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify'
export const hasGmail = (a: Pick<GoogleAccount, 'scopes'>) => !!a.scopes?.includes(GMAIL_SCOPE)

// ---------- Access tokens and API calls ----------

const tokens = new Map<string, { value: string; exp: number }>()

async function accessToken(accountId: string, force = false) {
  const cached = tokens.get(accountId)
  if (!force && cached && cached.exp > Date.now() + 60_000) return cached.value
  const account = await db.google_accounts.get(accountId)
  if (!account || account.deleted_at) throw new Error('Cuenta no vinculada')
  try {
    const res = await api<{ access_token: string; expires_in: number }>('/api/google/token', { token: account.token })
    tokens.set(accountId, { value: res.access_token, exp: Date.now() + res.expires_in * 1000 })
    return res.access_token
  } catch (e) {
    if (e instanceof Error && e.message === 'reauth') {
      await db.google_accounts.update(accountId, { needs_reauth: 1 })
      throw new Error(`Google pide volver a vincular ${account.email}`)
    }
    throw e
  }
}

/** fetch() against a Google API as the given linked account. */
export async function gfetch<T>(accountId: string, url: string, init: RequestInit = {}): Promise<T> {
  const call = async (token: string) =>
    fetch(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } })
  let res = await call(await accessToken(accountId))
  if (res.status === 401) res = await call(await accessToken(accountId, true))
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(body.error?.message ?? `Google respondió ${res.status}`)
  }
  return (res.status === 204 ? null : res.json()) as Promise<T>
}

// ---------- Calendar ----------

export interface GoogleCalendar {
  id: string
  summary: string
  backgroundColor?: string
  primary?: boolean
  selected?: boolean
}

export async function listCalendars(accountId: string) {
  const res = await gfetch<{ items: GoogleCalendar[] }>(
    accountId,
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=250',
  )
  return res.items
}

interface GEvent {
  id: string
  status?: string
  summary?: string
  location?: string
  description?: string
  hangoutLink?: string
  start: { date?: string; dateTime?: string }
  end: { date?: string; dateTime?: string }
}

/** Events of one Google calendar between two dates, recurring ones expanded by Google. */
export async function fetchGoogleEvents(accountId: string, calendarId: string, sourceId: string, from: Date, to: Date) {
  const out: CalendarEvent[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: 'true',
      maxResults: '2500',
      ...(pageToken ? { pageToken } : {}),
    })
    const res = await gfetch<{ items: GEvent[]; nextPageToken?: string }>(
      accountId,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    )
    for (const e of res.items) {
      if (e.status === 'cancelled') continue
      const start = e.start.date ?? new Date(e.start.dateTime!).toISOString()
      out.push({
        id: `${sourceId}:${e.id}`,
        source_id: sourceId,
        title: e.summary || '(Sin título)',
        start,
        end: e.end.date ?? new Date(e.end.dateTime!).toISOString(),
        all_day: e.start.date ? 1 : 0,
        location: e.location ?? null,
        description: e.description ?? null,
        meet_url: e.hangoutLink ?? null,
      })
    }
    pageToken = res.nextPageToken
  } while (pageToken)
  return out
}

// ---------- Drive ----------

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  iconLink?: string
  thumbnailLink?: string
  webViewLink?: string
  modifiedTime?: string
  size?: string
}

export const FOLDER = 'application/vnd.google-apps.folder'
const FILE_FIELDS = 'id,name,mimeType,iconLink,thumbnailLink,webViewLink,modifiedTime,size'

/** Where to list: a folder, "shared with me", a shared drive, or a search. */
export type DriveLocation =
  | { kind: 'folder'; id: string; driveId?: string }
  | { kind: 'shared' }
  | { kind: 'search'; query: string }

export async function listDrive(accountId: string, loc: DriveLocation, pageToken?: string) {
  const q =
    loc.kind === 'folder'
      ? `'${loc.id}' in parents and trashed = false`
      : loc.kind === 'shared'
        ? 'sharedWithMe = true and trashed = false'
        : `name contains '${loc.query.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and trashed = false`
  const params = new URLSearchParams({
    q,
    fields: `nextPageToken,files(${FILE_FIELDS})`,
    pageSize: '200',
    orderBy: loc.kind === 'search' ? 'modifiedTime desc' : 'folder,name_natural',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    ...(loc.kind === 'folder' && loc.driveId ? { corpora: 'drive', driveId: loc.driveId } : { corpora: 'user' }),
    ...(loc.kind === 'search' ? { corpora: 'allDrives' } : {}),
    ...(pageToken ? { pageToken } : {}),
  })
  return gfetch<{ files: DriveFile[]; nextPageToken?: string }>(accountId, `https://www.googleapis.com/drive/v3/files?${params}`)
}

export async function listSharedDrives(accountId: string) {
  const res = await gfetch<{ drives?: { id: string; name: string }[] }>(
    accountId,
    'https://www.googleapis.com/drive/v3/drives?pageSize=100',
  )
  return res.drives ?? []
}

export function setAccountCategory(accountId: string, category: CalendarCategory) {
  return db.google_accounts.update(accountId, { category, updated_at: now(), dirty: 1 }).then(schedulePush)
}

/** URL that shows a Drive file inside an iframe, as the given account. */
export function drivePreviewUrl(file: Pick<DriveFile, 'id' | 'webViewLink'>, email: string) {
  const base = file.webViewLink?.match(/^https:\/\/(docs|drive)\.google\.com\/[^?#]*\/d\/[^/?#]+/)?.[0] ?? `https://drive.google.com/file/d/${file.id}`
  return `${base}/preview?authuser=${encodeURIComponent(email)}`
}

export const DRIVE_WRITE = 'https://www.googleapis.com/auth/drive'
export const hasDriveWrite = (a: Pick<GoogleAccount, 'scopes'>) => !!a.scopes?.split(' ').includes(DRIVE_WRITE)

export const isVideo = (f: Pick<DriveFile, 'mimeType'>) => f.mimeType.startsWith('video/')

/** A subfolder by exact name (case-insensitive), or null. */
export async function findFolder(accountId: string, parentId: string, name: string) {
  const { files } = await listDrive(accountId, { kind: 'folder', id: parentId })
  return files.find((f) => f.mimeType === FOLDER && f.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null
}

export async function createFolder(accountId: string, parentId: string, name: string) {
  return gfetch<DriveFile>(accountId, `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=${FILE_FIELDS}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
  })
}

/** The subfolder with that name, created if it doesn't exist yet. */
export async function ensureFolder(accountId: string, parentId: string, name: string) {
  return (await findFolder(accountId, parentId, name)) ?? (await createFolder(accountId, parentId, name))
}

export async function getFile(accountId: string, fileId: string) {
  return gfetch<DriveFile>(accountId, `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true&fields=${FILE_FIELDS}`)
}

/** Short-lived token for the service worker to stream a Drive video (see sw.ts). */
export async function streamToken(accountId: string) {
  return accessToken(accountId)
}
