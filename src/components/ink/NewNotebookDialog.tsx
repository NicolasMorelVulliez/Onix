import { useLiveQuery } from 'dexie-react-hooks'
import { FileUp, Folder, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { db } from '../../lib/db'
import { hasDriveWrite, startLinkGoogle } from '../../lib/google'
import { A4, PAPERS } from '../../lib/ink/geometry'
import { createNotebook, importPdf } from '../../lib/ink/store'
import { useInkTools } from '../../lib/ink/tools'
import { cx } from '../../lib/util'
import { Dialog } from '../calendar/Dialog'
import { DriveBrowser } from '../drive/DriveBrowser'
import { PaperIcon } from './InkToolbar'
import { useOpenInk } from './useOpenInk'

/**
 * A new notebook (paper to write on) or a PDF from the device, saved as a PDF in a Drive folder:
 * the one where it was asked for (a class, a subject) or one chosen here.
 */
export function NewNotebookDialog({
  folder: initial,
  defaultName,
  onClose,
}: {
  folder: { accountId: string; id: string | null; name: string } | null
  defaultName: string
  onClose: () => void
}) {
  const openInk = useOpenInk()
  const accounts = useLiveQuery(() => db.google_accounts.filter((a) => !a.deleted_at).toArray(), [])
  const paper = useInkTools((s) => s.paper)
  const setTools = useInkTools((s) => s.set)
  const [name, setName] = useState(defaultName)
  const [landscape, setLandscape] = useState(false)
  const [picked, setPicked] = useState(initial)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const writable = accounts?.filter(hasDriveWrite) ?? []
  const folder = picked ?? (writable[0] ? { accountId: writable[0].id, id: null, name: 'Mi unidad' } : null)
  const account = accounts?.find((a) => a.id === folder?.accountId)
  const canWrite = !!account && hasDriveWrite(account)
  const target = { accountId: folder?.accountId ?? null, folderId: folder?.id ?? null }

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label)
    setError(null)
    try {
      const id = await fn()
      onClose()
      await openInk(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(null)
    }
  }

  if (picking) {
    return (
      <Dialog title="¿En qué carpeta de Drive?" onClose={() => setPicking(false)}>
        <DriveBrowser
          onSelect={() => {}}
          onPickFolder={(f, accountId) => {
            setPicked({ accountId, id: f.id === 'root' ? null : f.id, name: f.name })
            setPicking(false)
          }}
        />
      </Dialog>
    )
  }

  return (
    <Dialog title="Nuevo cuaderno" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre"
          className="w-full rounded-md border border-line bg-bg px-2 py-1.5 text-base font-medium outline-none focus:border-accent"
        />
        <div className="grid grid-cols-4 gap-2">
          {PAPERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setTools({ paper: p.id })}
              className={cx('flex flex-col items-center gap-1.5 rounded-lg border p-2', paper === p.id ? 'border-accent bg-accent/10' : 'border-line hover:bg-hover')}
            >
              <span className={cx('flex items-center justify-center', landscape && 'rotate-90')}>
                <span className="scale-[2.2] py-3">
                  <PaperIcon paper={p.id} />
                </span>
              </span>
              <span className="text-xs">{p.name}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-md bg-hover p-0.5 text-xs">
          {[false, true].map((l) => (
            <button key={String(l)} type="button" onClick={() => setLandscape(l)} className={cx('flex-1 rounded px-2 py-1', landscape === l && 'bg-bg font-medium shadow-sm')}>
              {l ? 'Horizontal' : 'Vertical'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line px-3 py-2 text-xs text-muted">
          <Folder size={14} />
          {folder ? (
            <span className="min-w-0 flex-1 truncate">
              Se guarda en Drive, en "{folder.name}"{account && accounts && accounts.length > 1 ? ` (${account.email})` : ''}
            </span>
          ) : (
            <span className="flex-1">Solo en este dispositivo (vinculá una cuenta de Google para guardarlo en Drive)</span>
          )}
          {!!accounts?.length && (
            <button type="button" onClick={() => setPicking(true)} className="rounded border border-line px-1.5 py-0.5 hover:bg-hover">
              Cambiar
            </button>
          )}
          {account && !canWrite && (
            <button type="button" onClick={() => startLinkGoogle(account.email)} className="rounded bg-accent px-1.5 py-0.5 text-accent-fg">
              Dar permiso para guardar
            </button>
          )}
        </div>

        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run('create', () => createNotebook({ ...target, name: name.trim() || 'Apuntes', paper, size: landscape ? [A4[1], A4[0]] : A4 }))}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-accent py-2 font-medium text-accent-fg disabled:opacity-50"
        >
          {busy === 'create' && <Loader2 size={15} className="animate-spin" />} Crear y empezar a escribir
        </button>

        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="h-px flex-1 bg-(--border)" /> o <span className="h-px flex-1 bg-(--border)" />
        </div>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => fileInput.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-line py-2 hover:bg-hover disabled:opacity-50"
        >
          {busy === 'import' ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />} Escribir sobre un PDF de este dispositivo
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) run('import', () => importPdf(file, target))
          }}
        />
      </div>
    </Dialog>
  )
}
