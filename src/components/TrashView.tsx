import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2, Undo2 } from 'lucide-react'
import { db } from '../lib/db'
import { purgePage, restorePage } from '../lib/pages'
import { TopBar } from './TopBar'

export function TrashView() {
  // Only the roots of what was deleted (children share the parent's deleted_at).
  const items = useLiveQuery(async () => {
    const trashed = await db.pages.filter((p) => !!p.deleted_at && !p.purged).toArray()
    const byId = new Map(trashed.map((p) => [p.id, p]))
    return trashed
      .filter((p) => {
        const parent = byId.get(p.parent_id ?? p.database_id ?? '')
        return !parent || parent.deleted_at !== p.deleted_at
      })
      .sort((a, b) => (a.deleted_at! < b.deleted_at! ? 1 : -1))
  }, [])

  return (
    <>
      <TopBar>
        <span className="text-sm">Papelera</span>
      </TopBar>
      <div className="mx-auto max-w-3xl px-12 pt-12 max-md:px-4">
        <h1 className="mb-6 text-3xl font-bold">Papelera</h1>
        {items?.length === 0 && <p className="text-muted">La papelera está vacía.</p>}
        <ul className="divide-y divide-(--border)">
          {items?.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2">
              <Link to="/p/$pageId" params={{ pageId: p.id }} className="min-w-0 flex-1 truncate hover:underline">
                {p.icon} {p.title || 'Sin título'}
              </Link>
              <span className="text-xs text-muted max-md:hidden">{new Date(p.deleted_at!).toLocaleString('es-AR')}</span>
              <button type="button" title="Restaurar" onClick={() => restorePage(p.id)} className="rounded p-1 text-muted hover:bg-hover">
                <Undo2 size={16} />
              </button>
              <button
                type="button"
                title="Eliminar definitivamente"
                onClick={() => confirm('¿Eliminar definitivamente? No se puede deshacer.') && purgePage(p.id)}
                className="rounded p-1 text-muted hover:bg-hover"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
