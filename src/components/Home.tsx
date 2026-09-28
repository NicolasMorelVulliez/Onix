import { Link, useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Database, FileText, Plus } from 'lucide-react'
import { db } from '../lib/db'
import { createDatabase, createPage } from '../lib/pages'
import { TopBar } from './TopBar'

export function Home() {
  const navigate = useNavigate()
  const recent = useLiveQuery(
    () =>
      db.pages
        .orderBy('updated_at')
        .reverse()
        .filter((p) => !p.deleted_at && !p.purged && !p.is_template)
        .limit(12)
        .toArray(),
    [],
  )
  const open = (id: string) => navigate({ to: '/p/$pageId', params: { pageId: id } })
  const hour = new Date().getHours()
  const greeting = hour < 13 ? 'Buen día' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <>
      <TopBar />
      <div className="mx-auto max-w-3xl px-12 pt-12 max-md:px-4">
        <h1 className="mb-8 page-title text-3xl font-bold">{greeting} 👋</h1>
        <div className="mb-10 flex flex-wrap gap-2 text-sm">
          <button type="button" onClick={async () => open((await createPage()).id)} className="flex items-center gap-1.5 rounded-md border border-line px-3 py-2 hover:bg-hover">
            <Plus size={16} /> Nueva página
          </button>
          <button type="button" onClick={async () => open((await createDatabase()).id)} className="flex items-center gap-1.5 rounded-md border border-line px-3 py-2 hover:bg-hover">
            <Database size={16} /> Nueva base de datos
          </button>
        </div>
        {!!recent?.length && (
          <>
            <h2 className="mb-2 text-sm font-medium text-muted">Editado recientemente</h2>
            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-2">
              {recent.map((p) => (
                <Link
                  key={p.id}
                  to="/p/$pageId"
                  params={{ pageId: p.id }}
                  className="flex h-28 flex-col justify-between rounded-lg border border-line p-3 hover:bg-hover"
                >
                  <span className="text-2xl">{p.icon ?? <FileText size={22} className="text-muted" />}</span>
                  <span className="truncate text-sm font-medium">{p.title || 'Sin título'}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
