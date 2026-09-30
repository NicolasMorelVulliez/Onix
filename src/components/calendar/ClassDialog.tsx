import { useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, Clock, Folder, Lightbulb, Loader2, NotebookPen, PlayCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ClassEvent } from '../../lib/classes'
import { db } from '../../lib/db'
import { FOLDER, isVideo, listDrive, type DriveFile } from '../../lib/google'
import { classNotebook, writableAccounts } from '../../lib/ink/store'
import { useInkTools } from '../../lib/ink/tools'
import type { DriveLink } from '../../lib/types'
import { useOpenInk } from '../ink/useOpenInk'
import { VideoPlayer } from '../drive/VideoPlayer'
import { Dialog } from './Dialog'

const folderUrl = (l: DriveLink, email?: string) => `https://drive.google.com/drive/folders/${l.folderId}?authuser=${encodeURIComponent(email ?? '')}`

/** A class from the calendar: its topic, what to prepare, Drive folders and the recording. */
export function ClassDialog({ ev, onClose }: { ev: ClassEvent; onClose: () => void }) {
  const navigate = useNavigate()
  const accounts = useLiveQuery(() => db.google_accounts.toArray(), [])
  const email = (l?: DriveLink | null) => accounts?.find((a) => a.id === l?.accountId)?.email
  const past = new Date(ev.end ?? ev.start).getTime() < Date.now()
  const [recordings, setRecordings] = useState<DriveFile[] | null>(null)
  const [playing, setPlaying] = useState<DriveFile | null>(null)
  const [opening, setOpening] = useState(false)
  const openInk = useOpenInk()
  const link = ev.page.drive

  // The class notebook: in the class folder (or the subject's), the same one every time.
  const takeNotes = async () => {
    setOpening(true)
    try {
      const folder = link ?? ev.subject?.drive ?? null
      const accountId = folder?.accountId ?? (await writableAccounts())[0]?.id ?? null
      const name = `Apuntes - ${ev.page.title}`
      await openInk(await classNotebook({ pageId: ev.page.id, accountId, folderId: folder?.folderId ?? null, name, paper: useInkTools.getState().paper }))
    } finally {
      setOpening(false)
    }
  }

  useEffect(() => {
    if (!link || !past) return
    ;(async () => {
      const { files } = await listDrive(link.accountId, { kind: 'folder', id: link.folderId })
      const rec = files.find((f) => f.mimeType === FOLDER && /^grabaci/i.test(f.name))
      const inside = rec ? (await listDrive(link.accountId, { kind: 'folder', id: rec.id })).files : []
      setRecordings([...inside, ...files].filter(isVideo))
    })().catch(() => setRecordings([]))
  }, [link, past])

  const when = new Date(ev.start)
  const fmt = when.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  const time = (x: string) => new Date(x).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const btn = 'flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 hover:bg-hover'

  return (
    <Dialog title={`${ev.subject ? `${ev.subject.title} · ` : ''}${ev.page.title}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="flex items-center gap-2">
          <Clock size={15} className="text-muted" />
          {fmt.charAt(0).toUpperCase() + fmt.slice(1)} · {time(ev.start)}
          {ev.end && ` – ${time(ev.end)}`}
        </p>
        {ev.topic && (
          <p className="flex items-start gap-2">
            <BookOpen size={15} className="mt-0.5 flex-none text-muted" /> {ev.topic}
          </p>
        )}
        {ev.prep && !past && (
          <p className="flex items-start gap-2 rounded-md bg-accent/10 p-2">
            <Lightbulb size={15} className="mt-0.5 flex-none text-accent" />
            <span>
              <b>Antes de la clase:</b> {ev.prep}
            </span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate({ to: '/p/$pageId', params: { pageId: ev.page.id } })} className="rounded-md bg-accent px-2.5 py-1.5 font-medium text-accent-fg">
            Abrir la clase
          </button>
          <button type="button" onClick={takeNotes} disabled={opening} className={btn}>
            {opening ? <Loader2 size={14} className="animate-spin" /> : <NotebookPen size={14} />} Tomar apuntes
          </button>
          {link && (
            <a href={folderUrl(link, email(link))} target="_blank" rel="noreferrer" className={btn}>
              <Folder size={14} /> Carpeta de la clase
            </a>
          )}
          {ev.subject?.drive && (
            <a href={folderUrl(ev.subject.drive, email(ev.subject.drive))} target="_blank" rel="noreferrer" className={btn}>
              <Folder size={14} /> Carpeta de la materia
            </a>
          )}
        </div>
        {past && link && (
          <div className="border-t border-line pt-3">
            {recordings === null ? (
              <Loader2 size={15} className="animate-spin text-muted" />
            ) : recordings.length ? (
              <div className="flex flex-wrap gap-2">
                {recordings.map((r) => (
                  <button key={r.id} type="button" onClick={() => setPlaying(r)} className="flex items-center gap-1.5 rounded-md bg-accent/15 px-2.5 py-1.5 font-medium text-accent">
                    <PlayCircle size={15} /> {recordings.length === 1 ? 'Ver grabación' : r.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-muted">Todavía no hay grabación en la carpeta "Grabaciones" de esta clase.</p>
            )}
          </div>
        )}
      </div>
      {playing && link && <VideoPlayer file={playing} accountId={link.accountId} email={email(link)} onClose={() => setPlaying(null)} />}
    </Dialog>
  )
}
