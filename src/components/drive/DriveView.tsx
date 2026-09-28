import { useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ExternalLink, Link2, X } from 'lucide-react'
import { useState } from 'react'
import { db } from '../../lib/db'
import { driveBlock } from '../../lib/drive-block'
import { drivePreviewUrl, type DriveFile } from '../../lib/google'
import { updatePage } from '../../lib/pages'
import { uid } from '../../lib/util'
import { TopBar } from '../TopBar'
import { MenuItem, Popover, usePopover } from '../ui'
import { DriveBrowser } from './DriveBrowser'

export function DriveView() {
  const [selected, setSelected] = useState<{ file: DriveFile; accountId: string } | null>(null)
  return (
    <>
      <TopBar>
        <span className="text-sm">Drive</span>
      </TopBar>
      <div className="flex gap-4 px-8 pb-10 pt-4 max-md:flex-col max-md:px-3">
        <div className="min-w-0 flex-1">
          <h1 className="mb-4 page-title text-3xl font-bold max-md:text-2xl">Drive</h1>
          <DriveBrowser selectedId={selected?.file.id} onSelect={(file, accountId) => setSelected({ file, accountId })} />
        </div>
        {selected && <FilePanel {...selected} onClose={() => setSelected(null)} />}
      </div>
    </>
  )
}

function FilePanel({ file, accountId, onClose }: { file: DriveFile; accountId: string; onClose: () => void }) {
  const account = useLiveQuery(() => db.google_accounts.get(accountId), [accountId])
  return (
    <aside className="w-[26rem] flex-none self-start rounded-lg border border-line p-3 text-sm max-md:w-full md:sticky md:top-14">
      <div className="mb-2 flex items-start gap-2">
        {file.iconLink && <img src={file.iconLink} alt="" className="mt-0.5 size-4" />}
        <h2 className="min-w-0 flex-1 break-words font-semibold">{file.name}</h2>
        <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded p-1 text-muted hover:bg-hover">
          <X size={16} />
        </button>
      </div>
      {account && (
        <iframe
          key={file.id}
          src={drivePreviewUrl(file, account.email)}
          title={file.name}
          className="mb-2 w-full rounded-md border border-line bg-hover"
          style={{ aspectRatio: '3 / 4' }}
          allow="autoplay; fullscreen"
        />
      )}
      <p className="mb-3 text-xs text-muted">
        Si la vista previa no carga, iniciá sesión en Google con {account?.email} en este navegador, o abrilo en Drive.
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={file.webViewLink}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 hover:bg-hover"
        >
          <ExternalLink size={14} /> Abrir en Drive
        </a>
        <LinkToPage file={file} accountId={accountId} />
      </div>
    </aside>
  )
}

/** Appends a Drive block to the chosen page. */
function LinkToPage({ file, accountId }: { file: DriveFile; accountId: string }) {
  const pop = usePopover()
  const [query, setQuery] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const navigate = useNavigate()
  const pages = useLiveQuery(
    () =>
      db.pages
        .filter((p) => !p.deleted_at && !p.purged && p.kind === 'page' && p.title.toLowerCase().includes(query.toLowerCase()))
        .limit(30)
        .toArray(),
    [query],
  )

  const link = async (pageId: string) => {
    const page = await db.pages.get(pageId)
    if (!page) return
    const block = { id: uid(), ...driveBlock(file, accountId), children: [] }
    await updatePage(pageId, { content: [...(page.content ?? []), block] as typeof page.content })
    pop.close()
    setDone(pageId)
  }

  if (done) {
    return (
      <button
        type="button"
        onClick={() => navigate({ to: '/p/$pageId', params: { pageId: done } })}
        className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 font-medium text-white"
      >
        Vinculado · ir a la página
      </button>
    )
  }
  return (
    <>
      <button
        type="button"
        onClick={(e) => pop.toggle(e.currentTarget)}
        className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 font-medium text-white"
      >
        <Link2 size={14} /> Vincular a una página
      </button>
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} className="w-72">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar página…"
          className="mb-1 w-full rounded border border-line bg-hover px-2 py-1 outline-none"
        />
        {pages?.map((p) => (
          <MenuItem key={p.id} onClick={() => link(p.id)}>
            {p.icon} {p.title || 'Sin título'}
          </MenuItem>
        ))}
        {pages?.length === 0 && <p className="px-2 py-1 text-muted">Sin resultados</p>}
      </Popover>
    </>
  )
}
