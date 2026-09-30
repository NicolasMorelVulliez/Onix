import { useLiveQuery } from 'dexie-react-hooks'
import { NotebookPen, Plus, Smartphone, Trash2, UploadCloud } from 'lucide-react'
import { useState } from 'react'
import { db } from '../../lib/db'
import { displayName } from '../../lib/ink/store'
import { TopBar } from '../TopBar'
import { NewNotebookDialog } from './NewNotebookDialog'
import { useOpenInk } from './useOpenInk'

/** Notebooks and PDFs written on from this device, newest first. */
export function NotebooksView() {
  const openInk = useOpenInk()
  const [creating, setCreating] = useState(false)
  const docs = useLiveQuery(async () => (await db.ink.toArray()).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)), [])

  const forget = async (id: string) => {
    if (!confirm('¿Quitarlo de este dispositivo? Sigue en Drive, con todo lo escrito.')) return
    await db.transaction('rw', db.ink, db.ink_strokes, async () => {
      await db.ink.delete(id)
      await db.ink_strokes.where('doc_id').equals(id).delete()
    })
  }

  return (
    <>
      <TopBar>
        <span className="text-sm">Cuadernos</span>
      </TopBar>
      <div className="mx-auto max-w-3xl px-12 pb-24 pt-12 max-md:px-4 max-md:pt-6">
        <div className="mb-2 flex items-center gap-3">
          <h1 className="flex-1 page-title text-3xl font-bold">Cuadernos</h1>
          <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg">
            <Plus size={16} /> Nuevo
          </button>
        </div>
        <p className="mb-6 text-sm text-muted">
          Para escribir con el lápiz. Se guardan como PDF en Drive; también podés escribir sobre cualquier PDF desde la carpeta de una clase o desde Drive.
        </p>
        {docs?.length === 0 && <p className="text-muted">Todavía no escribiste en ningún cuaderno desde este dispositivo.</p>}
        <ul className="divide-y divide-(--border)">
          {docs?.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-1">
              <button type="button" onClick={() => openInk(d.id)} className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1.5 text-left hover:bg-hover">
                <NotebookPen size={16} className="flex-none text-accent" />
                <span className="min-w-0 flex-1 truncate">{displayName(d.name)}</span>
                {!d.account_id ? (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Smartphone size={13} /> Solo acá
                  </span>
                ) : d.dirty ? (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <UploadCloud size={13} /> Sin subir
                  </span>
                ) : null}
                <span className="flex-none text-xs text-muted max-md:hidden">{new Date(d.updated_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>
              </button>
              {d.file_id && !d.dirty && (
                <button type="button" title="Quitar de este dispositivo" onClick={() => forget(d.id)} className="rounded p-1 text-muted hover:bg-hover">
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      {creating && <NewNotebookDialog folder={null} defaultName="Apuntes" onClose={() => setCreating(false)} />}
    </>
  )
}
