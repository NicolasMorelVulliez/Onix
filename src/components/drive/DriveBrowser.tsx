import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Folder, HardDrive, Loader2, Search, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { db } from '../../lib/db'
import { FOLDER, listDrive, listSharedDrives, type DriveFile, type DriveLocation } from '../../lib/google'
import { cx } from '../../lib/util'

interface Crumb {
  name: string
  loc: DriveLocation
}

const ROOT: Crumb = { name: 'Mi unidad', loc: { kind: 'folder', id: 'root' } }

/**
 * Drive explorer for every linked Google account. Used by the Drive tab and by the
 * "/drive" picker in the editor. `onSelect` fires for files (not folders).
 */
export function DriveBrowser({
  onSelect,
  selectedId,
}: {
  onSelect: (file: DriveFile, accountId: string) => void
  selectedId?: string
}) {
  const accounts = useLiveQuery(() => db.google_accounts.filter((a) => !a.deleted_at).toArray(), [])
  const [accountId, setAccountId] = useState<string | null>(null)
  const [path, setPath] = useState<Crumb[]>([ROOT])
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [next, setNext] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [drives, setDrives] = useState<{ id: string; name: string }[]>([])
  const account = accounts?.find((a) => a.id === accountId) ?? accounts?.[0]
  const aid = account?.id
  const loc = path.at(-1)!.loc

  useEffect(() => {
    if (!aid) return
    setDrives([])
    listSharedDrives(aid).then(setDrives).catch(() => {})
  }, [aid])

  useEffect(() => {
    if (!aid) return
    let cancelled = false
    setFiles(null)
    setError(null)
    listDrive(aid, loc)
      .then((r) => {
        if (cancelled) return
        setFiles(r.files)
        setNext(r.nextPageToken)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [aid, loc])

  if (accounts?.length === 0) {
    return (
      <p className="p-4 text-sm text-muted">
        No hay cuentas de Google vinculadas.{' '}
        <a href="/accounts" className="text-accent hover:underline">
          Vincular una cuenta
        </a>
      </p>
    )
  }
  if (!account) return null

  const go = (crumbs: Crumb[]) => {
    setQuery('')
    setPath(crumbs)
  }
  const open = (f: DriveFile) => {
    if (f.mimeType !== FOLDER) return onSelect(f, account.id)
    const driveId = loc.kind === 'folder' ? loc.driveId : undefined
    go([...path, { name: f.name, loc: { kind: 'folder', id: f.id, driveId } }])
  }
  const more = async () => {
    const r = await listDrive(account.id, loc, next)
    setFiles((cur) => [...(cur ?? []), ...r.files])
    setNext(r.nextPageToken)
  }

  const place = (name: string, l: DriveLocation, icon: React.ReactNode) => {
    const active = path.length === 1 && JSON.stringify(path[0].loc) === JSON.stringify(l)
    return (
      <button
        type="button"
        onClick={() => go([{ name, loc: l }])}
        className={cx('flex w-full items-center gap-2 truncate rounded px-2 py-1 text-left hover:bg-hover', active && 'bg-hover font-medium')}
      >
        {icon} <span className="truncate">{name}</span>
      </button>
    )
  }

  return (
    <div className="flex min-h-0 gap-3 text-sm max-md:flex-col">
      <div className="w-52 flex-none space-y-3 max-md:w-full">
        {accounts && accounts.length > 1 && (
          <select
            value={account.id}
            onChange={(e) => {
              setAccountId(e.target.value)
              go([ROOT])
            }}
            className="w-full rounded-md border border-line bg-bg px-2 py-1"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
        )}
        <div className="max-md:flex max-md:gap-1 max-md:overflow-x-auto">
          {place('Mi unidad', ROOT.loc, <HardDrive size={15} className="flex-none text-muted" />)}
          {place('Compartido conmigo', { kind: 'shared' }, <Users size={15} className="flex-none text-muted" />)}
          {drives.map((d) => (
            <div key={d.id}>{place(d.name, { kind: 'folder', id: d.id, driveId: d.id }, <Folder size={15} className="flex-none text-muted" />)}</div>
          ))}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (query.trim()) setPath([{ name: `Búsqueda: ${query.trim()}`, loc: { kind: 'search', query: query.trim() } }])
          }}
          className="mb-2 flex items-center gap-2 rounded-md border border-line px-2"
        >
          <Search size={15} className="text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Buscar en el Drive de ${account.email}`}
            className="min-w-0 flex-1 bg-transparent py-1.5 outline-none"
          />
        </form>
        <div className="mb-2 flex flex-wrap items-center gap-1 text-muted">
          {path.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} />}
              <button type="button" onClick={() => go(path.slice(0, i + 1))} className={cx('rounded px-1 hover:bg-hover', i === path.length - 1 && 'text-fg')}>
                {c.name}
              </button>
            </span>
          ))}
        </div>

        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        {!files && !error && <Loader2 size={16} className="animate-spin text-muted" />}
        {files?.length === 0 && <p className="py-6 text-center text-muted">Esta carpeta está vacía.</p>}
        <ul>
          {files?.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => open(f)}
                className={cx('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-hover', selectedId === f.id && 'bg-hover')}
              >
                {f.iconLink ? <img src={f.iconLink} alt="" className="size-4 flex-none" /> : <Folder size={16} className="flex-none text-muted" />}
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                {f.modifiedTime && (
                  <span className="flex-none text-xs text-muted max-md:hidden">
                    {new Date(f.modifiedTime).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {next && (
          <button type="button" onClick={more} className="mt-1 w-full rounded py-1.5 text-muted hover:bg-hover">
            Cargar más
          </button>
        )}
      </div>
    </div>
  )
}
