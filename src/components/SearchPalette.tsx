import { useNavigate } from '@tanstack/react-router'
import { Command } from 'cmdk'
import { useLiveQuery } from 'dexie-react-hooks'
import { Database, FileText, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { createPage } from '../lib/pages'
import { useUI } from '../lib/ui-store'

export function SearchPalette() {
  const open = useUI((s) => s.searchOpen)
  const setOpen = useUI((s) => s.setSearchOpen)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(!useUI.getState().searchOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  const pages = useLiveQuery(
    () =>
      open
        ? db.pages
            .filter((p) => !p.deleted_at && !p.purged)
            .toArray()
            .then((ps) => ps.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)))
        : [],
    [open],
  )
  const parents = new Map(pages?.map((p) => [p.id, p]))

  const go = (id: string) => {
    setOpen(false)
    setQuery('')
    useUI.getState().setSidebarOpen(false)
    navigate({ to: '/p/$pageId', params: { pageId: id } })
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Buscar"
      overlayClassName="fixed inset-0 z-40 bg-black/30"
      contentClassName="fixed left-1/2 top-[12vh] z-50 w-[36rem] max-w-[calc(100vw-24px)] -translate-x-1/2 material pop-in overflow-hidden rounded-xl border border-line bg-elevated shadow-pop"
    >
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="Buscar páginas…"
        className="w-full border-b border-line bg-transparent px-4 py-3 text-base outline-none"
      />
      <Command.List className="max-h-[60vh] overflow-y-auto p-1 text-sm">
        <Command.Empty className="px-3 py-6 text-center text-muted">Sin resultados</Command.Empty>
        {pages?.slice(0, query ? 200 : 30).map((p) => {
          const parent = parents.get(p.parent_id ?? p.database_id ?? '')
          return (
            <Command.Item
              key={p.id}
              value={`${p.title || 'Sin título'} ${p.id}`}
              onSelect={() => go(p.id)}
              className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 data-[selected=true]:bg-hover"
            >
              <span className="flex w-5 justify-center">
                {p.icon ?? (p.kind === 'database' ? <Database size={15} className="text-muted" /> : <FileText size={15} className="text-muted" />)}
              </span>
              <span className="truncate">{p.title || 'Sin título'}</span>
              {parent && <span className="ml-auto truncate text-xs text-muted">{parent.title || 'Sin título'}</span>}
            </Command.Item>
          )
        })}
        <Command.Item
          value={`crear nueva página ${query}`}
          onSelect={async () => go((await createPage({ title: query })).id)}
          className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-muted data-[selected=true]:bg-hover"
        >
          <Plus size={15} /> Nueva página{query && `: “${query}”`}
        </Command.Item>
      </Command.List>
    </Command.Dialog>
  )
}
