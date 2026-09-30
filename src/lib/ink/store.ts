/**
 * Handwriting documents on this device and in Drive. The PDF in Drive is the real copy (with the
 * strokes inside, see pdf.ts); this device keeps a cached copy so it opens instantly and can be
 * written on without connection, and uploads the changes when it can.
 */
import { create } from 'zustand'
import { db } from '../db'
import { ensureFolder, fileAsPdf, fileMeta, findTagged, hasDriveWrite, PDF, uploadPdf, type DriveFile } from '../google'
import type { DriveLink } from '../types'
import { now, uid } from '../util'
import { buildPdf, parsePdf } from './client'
import type { ParsedPdf } from './pdf'
import { A4 } from './geometry'
import type { InkDoc, InkPage, PageSpec, Paper } from './types'

export const displayName = (name: string) => name.replace(/\.pdf$/i, '')
const pdfName = (name: string) => (/\.pdf$/i.test(name) ? name : `${name}.pdf`)

// ---------- Save status (for the editor's toolbar) ----------

export type InkStatus = { state: 'saved' | 'saving' | 'pending' | 'offline' | 'local' | 'error'; message?: string }
export const useInkStatus = create<Record<string, InkStatus>>(() => ({}))
const setStatus = (id: string, status: InkStatus) => useInkStatus.setState({ [id]: status })

// ---------- On this device ----------

export async function loadDoc(id: string): Promise<{ doc: InkDoc; pages: InkPage[] } | null> {
  const doc = await db.ink.get(id)
  if (!doc) return null
  const rows = await db.ink_strokes.where('doc_id').equals(id).toArray()
  const strokes = new Map(rows.map((r) => [r.id.slice(id.length + 1), r.strokes]))
  return { doc, pages: doc.pages.map((p) => ({ ...p, strokes: strokes.get(p.key) ?? [] })) }
}

const spec = ({ key, source, paper, width, height }: InkPage): PageSpec => ({ key, source, paper, width, height })

/** Keeps a parsed PDF as document `id` (replacing what was there). */
async function storeParsed(id: string, fields: Omit<InkDoc, 'id' | 'base' | 'pages' | 'rev' | 'updated_at'>, parsed: ParsedPdf) {
  await db.transaction('rw', db.ink, db.ink_strokes, async () => {
    const rev = (await db.ink.get(id))?.rev ?? 0
    await db.ink.put({ ...fields, id, base: parsed.base, pages: parsed.pages.map(spec), rev, updated_at: now() })
    await db.ink_strokes.where('doc_id').equals(id).delete()
    await db.ink_strokes.bulkPut(parsed.pages.filter((p) => p.strokes.length).map((p) => ({ id: `${id}:${p.key}`, doc_id: id, strokes: p.strokes })))
  })
}

/**
 * Saves the editor's pages. Only pages whose strokes changed (by reference) are written, so
 * writing on a 100-page PDF doesn't copy the whole document on every stroke.
 */
export function localSaver(id: string, initial: InkPage[]) {
  const saved = new Map(initial.map((p) => [p.key, p.strokes]))
  return async (pages: InkPage[]) => {
    const changed = pages.filter((p) => saved.get(p.key) !== p.strokes)
    const gone = [...saved.keys()].filter((k) => !pages.some((p) => p.key === k))
    await db.transaction('rw', db.ink, db.ink_strokes, async () => {
      const doc = await db.ink.get(id)
      if (!doc) return
      await db.ink.update(id, { pages: pages.map(spec), dirty: 1, rev: doc.rev + 1, updated_at: now() })
      await db.ink_strokes.bulkPut(changed.map((p) => ({ id: `${id}:${p.key}`, doc_id: id, strokes: p.strokes })))
      await db.ink_strokes.bulkDelete(gone.map((k) => `${id}:${k}`))
    })
    for (const p of changed) saved.set(p.key, p.strokes)
    for (const k of gone) saved.delete(k)
  }
}

export const sheet = (paper: Paper, [width, height]: [number, number] = A4): InkPage => ({ key: uid(), source: null, paper, width, height, strokes: [] })

/** A new notebook, saved to Drive (in `folderId`) on the first upload. */
export async function createNotebook(o: { accountId: string | null; folderId: string | null; name: string; paper: Paper; size?: [number, number]; pageId?: string }) {
  const id = `n_${uid()}`
  const page = spec(sheet(o.paper, o.size))
  await db.ink.put({
    id,
    account_id: o.accountId,
    file_id: null,
    folder_id: o.folderId,
    source_id: null,
    notebook: 1,
    page_id: o.pageId ?? null,
    name: pdfName(o.name),
    base: null,
    pages: [page],
    remote: null,
    dirty: 1,
    rev: 1,
    updated_at: now(),
  })
  return id
}

/** A PDF from the device (Files on the iPad), uploaded to `folderId` to write on it. */
export async function importPdf(file: File, o: { accountId: string | null; folderId: string | null }) {
  const id = `n_${uid()}`
  const parsed = await parsePdf(await file.arrayBuffer())
  await storeParsed(id, { account_id: o.accountId, file_id: null, folder_id: o.folderId, source_id: null, notebook: 0, name: pdfName(file.name), remote: null, dirty: 1 }, parsed)
  return id
}

/** Which local document holds a Drive file (it may be one made from it, like a PDF of some slides). */
export async function docIdFor(fileId: string) {
  const doc = (await db.ink.where('file_id').equals(fileId).first()) ?? (await db.ink.where('source_id').equals(fileId).first())
  return doc?.id ?? `d_${fileId}`
}

// ---------- From Drive ----------

/** A PDF Onix can show but not write on as it is (it can be turned into images). */
export class UnreadablePdf extends Error {}

async function parseDownloaded(bytes: ArrayBuffer) {
  try {
    return await parsePdf(bytes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (/contraseña/.test(message)) throw e
    throw new UnreadablePdf(message)
  }
}

/**
 * Downloads a Drive file into document `id`. PDFs are written on as they are (or on a copy when
 * the account can't edit them); Google/Office files on a PDF made from them, next to them.
 */
export async function fetchFromDrive(id: string, accountId: string, fileId: string, folderId?: string | null) {
  const meta = await fileMeta(accountId, fileId)
  const own = meta.mimeType === PDF && meta.capabilities?.canEdit !== false
  // A PDF Onix already made from this file (on another device, for example)?
  const made = own ? null : (await findTagged(accountId, { onixSource: fileId }))[0]
  const target = own ? meta : made ? await fileMeta(accountId, made.id) : null

  const parsed = await parseDownloaded(await fileAsPdf(accountId, target ?? meta))
  const stem = displayName(meta.name).replace(/\.(pptx?|docx?|xlsx?|odp|odt|rtf|txt)$/i, '')
  await storeParsed(
    id,
    {
      account_id: accountId,
      file_id: target?.id ?? null,
      folder_id: folderId ?? meta.parents?.[0] ?? null,
      source_id: own ? null : fileId,
      notebook: target?.appProperties?.onix === 'notebook' ? 1 : 0,
      page_id: target?.appProperties?.onixPage ?? null,
      name: target?.name ?? pdfName(meta.mimeType === PDF ? `${stem} (apuntes)` : stem),
      remote: target?.md5Checksum ?? null,
      dirty: 0,
    },
    parsed,
  )
}

/**
 * If the file changed in Drive (written on another device), brings the new version — unless
 * `gaveUp()` says the editor stopped waiting and opened the copy it had.
 */
export async function refreshFromDrive(doc: InkDoc, gaveUp: () => boolean = () => false) {
  if (!doc.file_id || !doc.account_id || doc.dirty) return false
  const meta = await fileMeta(doc.account_id, doc.file_id)
  if (meta.trashed || !meta.md5Checksum || meta.md5Checksum === doc.remote) return false
  const parsed = await parseDownloaded(await fileAsPdf(doc.account_id, meta))
  if (gaveUp()) return false
  await storeParsed(doc.id, { ...doc, name: meta.name, remote: meta.md5Checksum, dirty: 0 }, parsed)
  return true
}

/** Finds the notebook of a class (on this device or in its Drive folder), or makes a new one. */
export async function classNotebook(o: { pageId: string; accountId: string | null; folderId: string | null; name: string; paper: Paper }) {
  const mine = await db.ink.filter((d) => d.page_id === o.pageId).first()
  if (mine) return mine.id
  // Made on another device: Drive knows it by the class, or by the class folder.
  if (o.accountId && navigator.onLine) {
    const found =
      (await findTagged(o.accountId, { onixPage: o.pageId }).catch(() => []))[0] ??
      (o.folderId ? (await findTagged(o.accountId, { onix: 'notebook' }, o.folderId).catch(() => []))[0] : undefined)
    if (found) return { file: found, accountId: o.accountId, folderId: o.folderId }
  }
  return createNotebook(o)
}

/**
 * A notebook created in Drive right away, for the "/cuaderno" block (which links the file):
 * in the page's folder, or in an "Onix" folder of My Drive.
 */
export async function notebookInDrive(o: { name: string; folder: DriveLink | null; paper: Paper }) {
  const accounts = await writableAccounts()
  const inFolder = o.folder && accounts.some((a) => a.id === o.folder!.accountId) ? o.folder : null
  const accountId = inFolder?.accountId ?? accounts[0]?.id
  if (!accountId) throw new Error('Para crear cuadernos, vinculá una cuenta de Google con permiso para guardar en Drive (Cuentas → "Actualizar permisos de Drive").')
  if (!navigator.onLine) throw new Error('Sin conexión: crear el cuaderno en una página necesita internet. Probá desde Cuadernos o desde la clase.')
  const folderId = inFolder?.folderId ?? (await ensureFolder(accountId, 'root', 'Onix')).id
  const docId = await createNotebook({ accountId, folderId, name: o.name, paper: o.paper })
  await uploadDoc(docId)
  const doc = await db.ink.get(docId)
  if (!doc?.file_id) {
    await db.ink.delete(docId)
    throw new Error(useInkStatus.getState()[docId]?.message ?? 'No se pudo crear el cuaderno en Drive.')
  }
  const file: DriveFile = { id: doc.file_id, name: doc.name, mimeType: PDF, webViewLink: `https://drive.google.com/file/d/${doc.file_id}/view` }
  return { docId, accountId, file }
}

/** Accounts that can save notebooks to Drive. */
export async function writableAccounts() {
  return (await db.google_accounts.filter((a) => !a.deleted_at).toArray()).filter(hasDriveWrite)
}

// ---------- Uploading ----------

const running = new Map<string, Promise<void>>()
const again = new Set<string>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

/** Uploads the document to Drive in a few seconds (writing again pushes it back). */
export function scheduleUpload(id: string, ms = 5000) {
  clearTimeout(timers.get(id))
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id)
      uploadDoc(id)
    }, ms),
  )
}

/** Uploads now; if an upload is already running, one more follows it. */
export function uploadDoc(id: string): Promise<void> {
  clearTimeout(timers.get(id))
  const current = running.get(id)
  if (current) {
    again.add(id)
    return current
  }
  const p = upload(id)
    .catch((e) => setStatus(id, { state: 'error', message: e instanceof Error ? e.message : String(e) }))
    .finally(() => {
      running.delete(id)
      if (again.delete(id)) uploadDoc(id)
    })
  running.set(id, p)
  return p
}

async function upload(id: string) {
  const loaded = await loadDoc(id)
  if (!loaded) return
  const { doc, pages } = loaded
  if (!doc.account_id) return setStatus(id, { state: 'local' })
  if (!doc.dirty) return setStatus(id, { state: 'saved' })
  if (!navigator.onLine) return setStatus(id, { state: 'offline' })
  setStatus(id, { state: 'saving' })

  const bytes = await buildPdf(doc.base, pages, displayName(doc.name))
  let fileId = doc.file_id
  let name = doc.name
  let note: string | undefined
  if (fileId) {
    const meta = await fileMeta(doc.account_id, fileId).catch(() => null)
    if (!meta || meta.trashed) {
      fileId = null
    } else if (meta.md5Checksum !== doc.remote) {
      // Written somewhere else meanwhile: both versions are kept.
      fileId = null
      name = pdfName(`${displayName(doc.name)} (copia ${new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' })})`)
      note = 'El archivo había cambiado en Drive: tus apuntes quedaron en una copia.'
    }
  }
  const tags = { onix: doc.notebook ? 'notebook' : 'ink', ...(doc.source_id ? { onixSource: doc.source_id } : {}), ...(doc.page_id ? { onixPage: doc.page_id } : {}) }
  const saved = fileId
    ? await uploadPdf(doc.account_id, { fileId }, bytes)
    : await uploadPdf(doc.account_id, { name, folderId: doc.folder_id, appProperties: tags }, bytes).catch((e) =>
        // A folder we can't write to (shared with us): the copy goes to My Drive.
        doc.folder_id ? uploadPdf(doc.account_id!, { name, folderId: null, appProperties: tags }, bytes) : Promise.reject(e),
      )

  const changedMeanwhile = await db.transaction('rw', db.ink, async () => {
    const cur = await db.ink.get(id)
    if (!cur) return false
    await db.ink.update(id, { file_id: saved.id, name: saved.name, remote: saved.md5Checksum ?? null, dirty: cur.rev === doc.rev ? 0 : 1 })
    return cur.rev !== doc.rev
  })
  if (changedMeanwhile) {
    setStatus(id, { state: 'pending' })
    scheduleUpload(id)
  } else setStatus(id, { state: 'saved', message: note })
}

/** Uploads what was left pending (offline, app closed…) when Onix opens or the connection returns. */
export function startInkSync() {
  const run = async () => {
    for (const id of await db.ink.where('dirty').equals(1).primaryKeys()) uploadDoc(id)
  }
  window.addEventListener('online', run)
  const t = setTimeout(run, 5000)
  return () => {
    window.removeEventListener('online', run)
    clearTimeout(t)
  }
}

export type OpenTarget = string | { file: Pick<DriveFile, 'id'>; accountId: string; folderId?: string | null }

/** Route params for the editor. */
export async function inkRoute(target: OpenTarget) {
  if (typeof target === 'string') return { docId: target, search: {} }
  return { docId: await docIdFor(target.file.id), search: { a: target.accountId, f: target.file.id, ...(target.folderId ? { d: target.folderId } : {}) } }
}
