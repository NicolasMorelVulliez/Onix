import { Link, useNavigate } from '@tanstack/react-router'
import { SmilePlus, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useBreadcrumbs, usePage } from '../lib/hooks'
import { purgePage, restorePage, setRowProp, updatePage } from '../lib/pages'
import type { Page } from '../lib/types'
import { AddPropertyButton, PropertyHeader } from './database/properties'
import { DatabaseView } from './database/DatabaseView'
import { PropertyValue } from './database/PropertyValue'
import { Editor } from './Editor'
import { TopBar } from './TopBar'
import { EmojiPicker, Popover, usePopover } from './ui'

export function PageView({ pageId }: { pageId: string }) {
  const page = usePage(pageId)
  const navigate = useNavigate()
  const openPage = (id: string) => navigate({ to: '/p/$pageId', params: { pageId: id } })

  if (page === undefined) return <TopBar />
  if (!page || page.purged) {
    return (
      <>
        <TopBar />
        <div className="p-12 text-muted">Esta página no existe.</div>
      </>
    )
  }

  return (
    <>
      <TopBar>
        <Breadcrumbs page={page} />
      </TopBar>
      {page.deleted_at && <TrashBanner page={page} />}
      <div className={page.kind === 'database' ? 'px-12 pb-24 max-md:px-4' : 'mx-auto max-w-3xl px-12 pb-40 max-md:px-4'}>
        <Header page={page} />
        {page.database_id && <RowProperties row={page} />}
        {page.kind === 'database' ? <DatabaseView db={page} onOpenRow={openPage} /> : <Editor key={page.id} page={page} />}
      </div>
    </>
  )
}

function Breadcrumbs({ page }: { page: Page }) {
  const chain = useBreadcrumbs(page) ?? []
  return (
    <div className="flex min-w-0 items-center gap-1 text-sm">
      {chain.map((p) => (
        <span key={p.id} className="flex min-w-0 items-center gap-1 max-md:hidden">
          <Link to="/p/$pageId" params={{ pageId: p.id }} className="truncate rounded px-1 text-muted hover:bg-hover">
            {p.icon} {p.title || 'Sin título'}
          </Link>
          <span className="text-muted">/</span>
        </span>
      ))}
      <span className="truncate px-1">
        {page.icon} {page.title || 'Sin título'}
      </span>
    </div>
  )
}

function TrashBanner({ page }: { page: Page }) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-red-500/90 px-4 py-2 text-sm text-white">
      Esta página está en la papelera.
      <button type="button" onClick={() => restorePage(page.id)} className="flex items-center gap-1 rounded border border-white/60 px-2 py-0.5">
        <Undo2 size={14} /> Restaurar
      </button>
      <button
        type="button"
        onClick={async () => {
          if (!confirm('¿Eliminar definitivamente? No se puede deshacer.')) return
          await purgePage(page.id)
          navigate({ to: '/' })
        }}
        className="flex items-center gap-1 rounded border border-white/60 px-2 py-0.5"
      >
        <Trash2 size={14} /> Eliminar definitivamente
      </button>
    </div>
  )
}

function Header({ page }: { page: Page }) {
  const emoji = usePopover()
  const [title, setTitle] = useState(page.title)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setTitle(page.title), [page.title])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0'
    el.style.height = `${el.scrollHeight}px`
  }, [title])
  // New empty pages start with the cursor in the title.
  useEffect(() => {
    if (!page.title && !page.content) ref.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id])

  return (
    <div className="group pt-16 max-md:pt-6">
      {page.icon ? (
        <button type="button" onClick={(e) => emoji.toggle(e.currentTarget)} className="mb-2 rounded text-6xl leading-none hover:bg-hover">
          {page.icon}
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => emoji.toggle(e.currentTarget)}
          className="mb-2 flex items-center gap-1 rounded px-1.5 py-1 text-sm text-muted opacity-0 hover:bg-hover group-hover:opacity-100 max-md:opacity-100"
        >
          <SmilePlus size={16} /> Agregar ícono
        </button>
      )}
      <Popover anchor={emoji.anchor} open={emoji.open} onClose={emoji.close}>
        <EmojiPicker
          onPick={(icon) => {
            emoji.close()
            updatePage(page.id, { icon })
          }}
          onRemove={
            page.icon
              ? () => {
                  emoji.close()
                  updatePage(page.id, { icon: null })
                }
              : undefined
          }
        />
      </Popover>
      <textarea
        ref={ref}
        rows={1}
        value={title}
        placeholder="Sin título"
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))}
        onBlur={() => title !== page.title && updatePage(page.id, { title })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLTextAreaElement).blur()
            document.querySelector<HTMLElement>('.bn-editor')?.focus()
          }
        }}
        className="w-full resize-none overflow-hidden bg-transparent page-title text-4xl font-bold leading-tight outline-none placeholder:text-muted/50 max-md:text-3xl"
      />
    </div>
  )
}

function RowProperties({ row }: { row: Page }) {
  const database = usePage(row.database_id!)
  if (!database) return null
  const schema = database.schema ?? []
  return (
    <div className="mb-4 mt-2 border-b border-line pb-3 text-sm">
      {schema.map((p) => (
        <div key={p.id} className="grid grid-cols-[10rem_1fr] items-center rounded hover:bg-hover max-md:grid-cols-[8rem_1fr]">
          <div className="h-8">
            <PropertyHeader prop={p} databaseId={database.id} />
          </div>
          <div className="min-h-8">
            <PropertyValue prop={p} value={row.props[p.id] ?? null} databaseId={database.id} onChange={(v) => setRowProp(row.id, p.id, v)} />
          </div>
        </div>
      ))}
      <AddPropertyButton databaseId={database.id} className="mt-1 flex items-center gap-1 rounded px-2 py-1 text-muted hover:bg-hover" />
    </div>
  )
}
