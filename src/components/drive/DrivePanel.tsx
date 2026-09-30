import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, ExternalLink, Folder, Loader2, NotebookPen, PenLine, PlayCircle, RefreshCw, Unlink, UploadCloud } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../../lib/db'
import { canWriteOn, FOLDER, isVideo, listDrive, PDF, type DriveFile } from '../../lib/google'
import { displayName } from '../../lib/ink/store'
import { updatePage } from '../../lib/pages'
import type { Page } from '../../lib/types'
import { cx } from '../../lib/util'
import { Dialog } from '../calendar/Dialog'
import { NewNotebookDialog } from '../ink/NewNotebookDialog'
import { useOpenInk } from '../ink/useOpenInk'
import { DriveBrowser } from './DriveBrowser'
import { VideoPlayer } from './VideoPlayer'

const RECORDINGS = /^grabaci(o|ó)n(es)?$/i

/** Links a Drive folder to a page (subject, class…). */
export function LinkDriveDialog({ page, onClose }: { page: Page; onClose: () => void }) {
  return (
    <Dialog title="Vincular carpeta de Drive" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">Entrá a la carpeta de "{page.title || 'esta página'}" y tocá "Vincular".</p>
      <DriveBrowser
        onSelect={() => {}}
        onPickFolder={(folder, accountId) => {
          updatePage(page.id, { drive: { accountId, folderId: folder.id, name: folder.name } })
          onClose()
        }}
      />
    </Dialog>
  )
}

/** The linked folder's files, live, with its recordings playable inside Onix. */
export function DrivePanel({ page }: { page: Page }) {
  const link = page.drive!
  const account = useLiveQuery(() => db.google_accounts.get(link.accountId), [link.accountId])
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [recordings, setRecordings] = useState<DriveFile[]>([])
  const [path, setPath] = useState<{ id: string; name: string }[]>([{ id: link.folderId, name: link.name }])
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<DriveFile | null>(null)
  const [relink, setRelink] = useState(false)
  const [newNotebook, setNewNotebook] = useState(false)
  const openInk = useOpenInk()
  const current = path.at(-1)!
  // Notebooks made here that aren't in the list yet: not uploaded (no connection…) or just uploaded.
  const local = useLiveQuery(() => db.ink.where('folder_id').equals(current.id).toArray(), [current.id])
  const pending = files ? local?.filter((d) => !d.file_id || !files.some((f) => f.id === d.file_id)) : []

  const load = useCallback(async () => {
    setError(null)
    setFiles(null)
    try {
      const { files } = await listDrive(link.accountId, { kind: 'folder', id: current.id })
      setFiles(files)
      // Recordings live in a "Grabaciones" subfolder (or right here).
      const recFolder = path.length === 1 ? files.find((f) => f.mimeType === FOLDER && RECORDINGS.test(f.name.trim())) : undefined
      const inside = recFolder ? (await listDrive(link.accountId, { kind: 'folder', id: recFolder.id })).files : []
      setRecordings([...inside, ...files].filter(isVideo))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [link.accountId, current.id, path.length])

  useEffect(() => {
    load()
  }, [load])

  const write = (f: DriveFile) => openInk({ file: f, accountId: link.accountId, folderId: current.id })
  const open = (f: DriveFile) => {
    if (f.mimeType === FOLDER) setPath([...path, { id: f.id, name: f.name }])
    else if (isVideo(f)) setPlaying(f)
    // PDFs open in Onix, ready to write on them with the pencil.
    else if (f.mimeType === PDF) write(f)
    else window.open(f.webViewLink, '_blank', 'noreferrer')
  }

  return (
    <section className="mb-4 rounded-lg border border-line text-sm">
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2">
        <Folder size={15} className="text-accent" />
        {path.map((c, i) => (
          <span key={c.id} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="text-muted" />}
            <button type="button" onClick={() => setPath(path.slice(0, i + 1))} className={cx('rounded px-1 hover:bg-hover', i === path.length - 1 ? 'font-medium' : 'text-muted')}>
              {c.name}
            </button>
          </span>
        ))}
        <span className="ml-auto flex items-center gap-0.5">
          <button type="button" onClick={() => setNewNotebook(true)} className="mr-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-accent hover:bg-hover">
            <NotebookPen size={14} /> Cuaderno
          </button>
          <button type="button" title="Actualizar" onClick={load} className="rounded p-1 text-muted hover:bg-hover">
            <RefreshCw size={13} />
          </button>
          <a href={`https://drive.google.com/drive/folders/${current.id}?authuser=${encodeURIComponent(account?.email ?? '')}`} target="_blank" rel="noreferrer" title="Abrir en Drive" className="rounded p-1 text-muted hover:bg-hover">
            <ExternalLink size={13} />
          </a>
          <button type="button" title="Cambiar carpeta" onClick={() => setRelink(true)} className="rounded p-1 text-muted hover:bg-hover">
            <Folder size={13} />
          </button>
          <button type="button" title="Desvincular" onClick={() => updatePage(page.id, { drive: null })} className="rounded p-1 text-muted hover:bg-hover">
            <Unlink size={13} />
          </button>
        </span>
      </div>

      {recordings.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-line px-3 py-2">
          {recordings.map((r) => (
            <button key={r.id} type="button" onClick={() => setPlaying(r)} className="flex items-center gap-1.5 rounded-md bg-accent/15 px-2.5 py-1 font-medium text-accent">
              <PlayCircle size={15} /> {recordings.length === 1 ? 'Ver grabación' : r.name}
            </button>
          ))}
        </div>
      )}

      <div className="max-h-72 overflow-y-auto p-1">
        {error && <p className="px-2 py-1 text-red-600 dark:text-red-400">{error}</p>}
        {!files && !error && <Loader2 size={15} className="m-2 animate-spin text-muted" />}
        {files?.length === 0 && !pending?.length && <p className="px-2 py-1 text-muted">La carpeta está vacía.</p>}
        {pending?.map((d) => (
          <button key={d.id} type="button" onClick={() => openInk(d.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-hover">
            <NotebookPen size={15} className="flex-none text-accent" />
            <span className="min-w-0 flex-1 truncate">{displayName(d.name)}</span>
            {d.dirty ? (
              <span className="flex flex-none items-center gap-1 text-xs text-muted">
                <UploadCloud size={13} /> Sin subir
              </span>
            ) : null}
          </button>
        ))}
        {files?.map((f) => (
          <div key={f.id} className="group/row flex items-center rounded hover:bg-hover">
            <button type="button" onClick={() => open(f)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left">
              {f.iconLink ? <img src={f.iconLink} alt="" className="size-4 flex-none" /> : <Folder size={15} className="flex-none text-muted" />}
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              {isVideo(f) && <PlayCircle size={14} className="flex-none text-accent" />}
              {f.modifiedTime && <span className="flex-none text-xs text-muted max-md:hidden">{new Date(f.modifiedTime).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>}
            </button>
            {canWriteOn(f) && (
              <button type="button" title="Escribir encima con el lápiz" onClick={() => write(f)} className="mr-1 rounded p-1 text-muted hover:text-accent">
                <PenLine size={14} />
              </button>
            )}
            {f.mimeType === PDF && (
              <a href={f.webViewLink} target="_blank" rel="noreferrer" title="Abrir en Drive" className="mr-1 rounded p-1 text-muted opacity-0 group-hover/row:opacity-100 max-md:hidden">
                <ExternalLink size={13} />
              </a>
            )}
          </div>
        ))}
      </div>
      {playing && <VideoPlayer file={playing} accountId={link.accountId} email={account?.email} onClose={() => setPlaying(null)} />}
      {relink && <LinkDriveDialog page={page} onClose={() => setRelink(false)} />}
      {newNotebook && (
        <NewNotebookDialog
          folder={{ accountId: link.accountId, id: current.id, name: current.name }}
          defaultName={`Apuntes - ${page.title || current.name}`}
          onClose={() => setNewNotebook(false)}
        />
      )}
    </section>
  )
}
