import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  CalendarDays,
  ChevronRight,
  Copy,
  Database,
  FileText,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { useMemo, useState, type DragEvent } from 'react'
import { useTreePages } from '../lib/hooks'
import { createDatabase, createPage, duplicatePage, movePage, trashPage } from '../lib/pages'
import { supabase } from '../lib/supabase'
import { useSyncStatus } from '../lib/sync'
import type { Page } from '../lib/types'
import { useUI } from '../lib/ui-store'
import { cx } from '../lib/util'
import { IconButton, MenuItem, Popover, usePopover } from './ui'

type DropPos = 'before' | 'inside' | 'after'

function useTree(pages: Page[] | undefined) {
  return useMemo(() => {
    const children = new Map<string | null, Page[]>()
    for (const p of pages ?? []) {
      const list = children.get(p.parent_id) ?? []
      list.push(p)
      children.set(p.parent_id, list)
    }
    // Pages whose parent is gone (e.g. parent trashed on another device) show at the root.
    const ids = new Set(pages?.map((p) => p.id))
    for (const p of pages ?? []) {
      if (p.parent_id && !ids.has(p.parent_id)) children.set(null, [...(children.get(null) ?? []), p])
    }
    return children
  }, [pages])
}

export function Sidebar() {
  const pages = useTreePages()
  const tree = useTree(pages)
  const navigate = useNavigate()
  const setSearchOpen = useUI((s) => s.setSearchOpen)
  const setSidebarOpen = useUI((s) => s.setSidebarOpen)
  const [dragId, setDragId] = useState<string | null>(null)

  const open = (id: string) => {
    navigate({ to: '/p/$pageId', params: { pageId: id } })
    setSidebarOpen(false)
  }

  const isDescendant = (id: string, ancestorId: string): boolean => {
    let cur = pages?.find((p) => p.id === id)
    while (cur?.parent_id) {
      if (cur.parent_id === ancestorId) return true
      cur = pages?.find((p) => p.id === cur!.parent_id)
    }
    return false
  }

  const onDrop = (target: Page, pos: DropPos) => {
    const id = dragId
    setDragId(null)
    if (!id || id === target.id || isDescendant(target.id, id)) return
    if (pos === 'inside') {
      const kids = tree.get(target.id) ?? []
      movePage(id, target.id, kids.at(-1)?.sort_key ?? null, null)
      useUI.getState().toggleExpanded(target.id, true)
      return
    }
    const siblings = (tree.get(target.parent_id) ?? []).filter((p) => p.id !== id)
    const i = siblings.findIndex((p) => p.id === target.id)
    const [a, b] = pos === 'before' ? [siblings[i - 1], siblings[i]] : [siblings[i], siblings[i + 1]]
    movePage(id, target.parent_id, a?.sort_key ?? null, b?.sort_key ?? null)
  }

  return (
    <nav className="safe-top flex h-full w-64 flex-col bg-sidebar text-sm">
      <div className="flex items-center gap-2 px-3 py-3 font-semibold">
        <span className="flex size-5 items-center justify-center rounded bg-fg text-[11px] text-bg">E</span>
        <span className="flex-1">Espacio</span>
        <SyncDot />
      </div>

      <div className="px-2">
        <SideButton icon={<Search size={16} />} onClick={() => setSearchOpen(true)}>
          Buscar <kbd className="ml-auto text-xs text-muted">⌘K</kbd>
        </SideButton>
        <SideButton icon={<Plus size={16} />} onClick={async () => open((await createPage()).id)}>
          Nueva página
        </SideButton>
        <SideButton
          icon={<CalendarDays size={16} />}
          onClick={() => {
            navigate({ to: '/calendar' })
            setSidebarOpen(false)
          }}
        >
          Calendario
        </SideButton>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto px-2 pb-4">
        <div className="px-2 pb-1 text-xs font-medium text-muted">Páginas</div>
        {(tree.get(null) ?? []).map((p) => (
          <TreeItem key={p.id} page={p} depth={0} tree={tree} onOpen={open} dragId={dragId} setDragId={setDragId} onDrop={onDrop} />
        ))}
        {pages && pages.length === 0 && <p className="px-2 py-1 text-muted">Todavía no hay páginas.</p>}
        <SideButton icon={<Database size={16} />} onClick={async () => open((await createDatabase()).id)}>
          Nueva base de datos
        </SideButton>
      </div>

      <div className="safe-bottom border-t border-line px-2 py-2">
        <Link to="/trash" onClick={() => setSidebarOpen(false)}>
          <SideButton icon={<Trash2 size={16} />}>Papelera</SideButton>
        </Link>
        {supabase && (
          <SideButton icon={<LogOut size={16} />} onClick={() => supabase!.auth.signOut()}>
            Cerrar sesión
          </SideButton>
        )}
      </div>
    </nav>
  )
}

function SideButton({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-muted hover:bg-hover">
      {icon}
      {children}
    </button>
  )
}

function SyncDot() {
  const { status, error } = useSyncStatus()
  const map = {
    local: ['bg-gray-400', 'Solo local (sin Supabase configurado)'],
    idle: ['bg-green-500', 'Sincronizado'],
    syncing: ['bg-blue-500 animate-pulse', 'Sincronizando…'],
    offline: ['bg-yellow-500', 'Sin conexión: los cambios se guardan y se suben al volver'],
    error: ['bg-red-500', `Error de sincronización: ${error}`],
  } as const
  const [color, label] = map[status]
  return <span title={label} className={cx('size-2 rounded-full', color)} />
}

function TreeItem({
  page,
  depth,
  tree,
  onOpen,
  dragId,
  setDragId,
  onDrop,
}: {
  page: Page
  depth: number
  tree: Map<string | null, Page[]>
  onOpen: (id: string) => void
  dragId: string | null
  setDragId: (id: string | null) => void
  onDrop: (target: Page, pos: DropPos) => void
}) {
  const params = useParams({ strict: false }) as { pageId?: string }
  const expanded = useUI((s) => !!s.expanded[page.id])
  const toggle = useUI((s) => s.toggleExpanded)
  const [dropPos, setDropPos] = useState<DropPos | null>(null)
  const menu = usePopover()
  const kids = tree.get(page.id) ?? []
  const active = params.pageId === page.id

  const posFromEvent = (e: DragEvent<HTMLDivElement>): DropPos => {
    const r = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - r.top
    if (y < r.height * 0.25) return 'before'
    if (y > r.height * 0.75) return 'after'
    return 'inside'
  }

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          setDragId(page.id)
        }}
        onDragEnd={() => setDragId(null)}
        onDragOver={(e) => {
          if (!dragId || dragId === page.id) return
          e.preventDefault()
          setDropPos(posFromEvent(e))
        }}
        onDragLeave={() => setDropPos(null)}
        onDrop={(e) => {
          e.preventDefault()
          setDropPos(null)
          onDrop(page, posFromEvent(e))
        }}
        onClick={() => onOpen(page.id)}
        style={{ paddingLeft: 4 + depth * 14 }}
        className={cx(
          'group relative flex cursor-pointer items-center gap-1 rounded py-1 pr-1 hover:bg-hover',
          active && 'bg-hover font-medium',
          dropPos === 'inside' && 'bg-accent/15 ring-1 ring-accent',
          dragId === page.id && 'opacity-40',
        )}
      >
        {dropPos === 'before' && <span className="absolute inset-x-0 -top-px h-0.5 bg-accent" />}
        {dropPos === 'after' && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />}
        <IconButton
          title={expanded ? 'Contraer' : 'Expandir'}
          className="size-5"
          onClick={(e) => {
            e.stopPropagation()
            toggle(page.id)
          }}
        >
          <ChevronRight size={14} className={cx('transition-transform', expanded && 'rotate-90', !kids.length && 'opacity-30')} />
        </IconButton>
        <span className="flex w-5 justify-center">
          {page.icon ?? (page.kind === 'database' ? <Database size={15} className="text-muted" /> : <FileText size={15} className="text-muted" />)}
        </span>
        <span className="min-w-0 flex-1 truncate">{page.title || 'Sin título'}</span>
        <span className="flex opacity-0 group-hover:opacity-100 max-md:opacity-100">
          <IconButton
            title="Más opciones"
            className="size-5"
            onClick={(e) => {
              e.stopPropagation()
              menu.toggle(e.currentTarget)
            }}
          >
            <MoreHorizontal size={14} />
          </IconButton>
          <IconButton
            title="Agregar subpágina"
            className="size-5"
            onClick={async (e) => {
              e.stopPropagation()
              const child = await createPage({ parent_id: page.id })
              toggle(page.id, true)
              onOpen(child.id)
            }}
          >
            <Plus size={14} />
          </IconButton>
        </span>
      </div>
      <Popover anchor={menu.anchor} open={menu.open} onClose={menu.close} className="w-48">
        <MenuItem
          icon={<Copy size={14} />}
          onClick={async () => {
            menu.close()
            const copy = await duplicatePage(page.id, { title: `${page.title || 'Sin título'} (copia)` })
            if (copy) onOpen(copy.id)
          }}
        >
          Duplicar
        </MenuItem>
        <MenuItem
          danger
          icon={<Trash2 size={14} />}
          onClick={() => {
            menu.close()
            trashPage(page.id)
          }}
        >
          Mover a la papelera
        </MenuItem>
      </Popover>
      {expanded &&
        (kids.length ? (
          kids.map((k) => (
            <TreeItem key={k.id} page={k} depth={depth + 1} tree={tree} onOpen={onOpen} dragId={dragId} setDragId={setDragId} onDrop={onDrop} />
          ))
        ) : (
          <div style={{ paddingLeft: 30 + depth * 14 }} className="py-1 text-xs text-muted">
            {page.kind === 'database' ? 'Las filas se ven dentro de la base' : 'Sin subpáginas'}
          </div>
        ))}
    </div>
  )
}
