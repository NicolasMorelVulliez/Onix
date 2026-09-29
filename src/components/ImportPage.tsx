import { useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, ChevronRight, Database, FileArchive, FileText, Image, Loader2, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { db } from '../lib/db'
import { commitImport, readNotionExport, type ImportPlan, type ImportResult, type PlanNode } from '../lib/notion-import'
import { createPage, trashPage } from '../lib/pages'
import type { Page } from '../lib/types'
import { bySortKey, cx } from '../lib/util'
import { TopBar } from './TopBar'

const NEW = '__new__'

export function ImportPage() {
  const navigate = useNavigate()
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [exclude, setExclude] = useState<Set<string>>(new Set())
  const [dest, setDest] = useState<string>('') // '' = top level
  const [newName, setNewName] = useState('UADE')
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pages = useLiveQuery(() => db.pages.filter((p) => !p.deleted_at && !p.purged && !p.database_id && p.kind === 'page').toArray(), [])
  const oldImports = pages?.filter((p) => p.title === 'Importado de Notion' && p.icon === '📥') ?? []
  const destinations = useMemo(() => flatten(pages ?? []), [pages])

  const read = async (file: File) => {
    setError(null)
    setResult(null)
    setBusy('Leyendo el archivo…')
    try {
      setPlan(await readNotionExport(file))
      setExclude(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(null)
  }

  const run = async () => {
    if (!plan) return
    setError(null)
    setBusy('Importando…')
    try {
      let parentId: string | null = dest || null
      if (dest === NEW) parentId = (await createPage({ title: newName.trim() || 'Sin título' })).id
      const r = await commitImport(plan, { parentId, exclude }, (d, t) => setProgress([d, t]))
      setResult(r)
      setPlan(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(null)
    setProgress(null)
  }

  const toggle = (key: string) => setExclude((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : new Set([...s, key])))

  return (
    <>
      <TopBar>
        <span className="text-sm">Importar de Notion</span>
      </TopBar>
      <div className="mx-auto max-w-3xl px-12 pb-24 pt-12 max-md:px-4 max-md:pt-6">
        <h1 className="page-title mb-2 text-3xl font-bold">Importar de Notion</h1>
        <p className="mb-6 text-sm text-muted">Trae tus páginas, subpáginas y bases de datos con la misma estructura. Antes de guardar ves una vista previa.</p>

        {oldImports.length > 0 && !plan && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-hover px-3 py-2 text-sm">
            <span className="flex-1">Tenés una importación anterior en "📥 Importado de Notion".</span>
            <button
              type="button"
              onClick={() => oldImports.forEach((p) => trashPage(p.id))}
              className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 hover:bg-bg"
            >
              <Trash2 size={13} /> Mandarla a la papelera
            </button>
          </div>
        )}

        {!plan && !result && (
          <>
            <section className="mb-6 rounded-lg border border-line p-4 text-sm">
              <h2 className="mb-2 font-semibold">1. Exportá desde Notion (en la compu)</h2>
              <ol className="list-decimal space-y-1 pl-5 text-muted">
                <li>
                  Una página con todo lo de adentro: <b className="text-fg">⋯ → Exportar</b>. Todo el espacio: <b className="text-fg">Configuración → General → Exportar todo el contenido</b>.
                </li>
                <li>
                  <b className="text-fg">Markdown y CSV</b>, contenido <b className="text-fg">Todo</b>, con <b className="text-fg">Incluir subpáginas</b> y{' '}
                  <b className="text-fg">Crear carpetas para subpáginas</b>.
                </li>
              </ol>
            </section>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files[0]
                if (f && !busy) read(f)
              }}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line px-4 py-10 text-center text-sm text-muted hover:bg-hover"
            >
              {busy ? <Loader2 size={28} className="animate-spin text-accent" /> : <FileArchive size={28} />}
              <span>{busy ?? <>2. Arrastrá el .zip acá o <span className="text-accent">elegilo</span></>}</span>
              <input
                type="file"
                accept=".zip,application/zip"
                disabled={!!busy}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) read(f)
                  e.target.value = ''
                }}
                className="hidden"
              />
            </label>
          </>
        )}

        {plan && (
          <section className="space-y-4 text-sm">
            <div className="rounded-lg border border-line p-4">
              <h2 className="mb-1 font-semibold">Vista previa</h2>
              <p className="mb-3 text-xs text-muted">
                {plan.pages} páginas · {plan.databases} bases de datos · {plan.rows} filas · {plan.images} imágenes. Destildá lo que no quieras traer.
              </p>
              <div className="max-h-[50vh] overflow-y-auto">
                {plan.roots.map((n) => (
                  <TreeNode key={n.key} node={n} depth={0} exclude={exclude} onToggle={toggle} />
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-line p-4">
              <h2 className="mb-2 font-semibold">¿Dónde lo pongo?</h2>
              <select value={dest} onChange={(e) => setDest(e.target.value)} className="w-full rounded-md border border-line bg-bg px-2 py-1.5">
                <option value="">En el nivel principal (como si lo hubieras creado)</option>
                <option value={NEW}>Dentro de una página nueva…</option>
                {destinations.map(({ page, depth }) => (
                  <option key={page.id} value={page.id}>
                    {'  '.repeat(depth)}Dentro de: {page.icon ? `${page.icon} ` : ''}
                    {page.title || 'Sin título'}
                  </option>
                ))}
              </select>
              {dest === NEW && (
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombre de la página (ej. UADE)"
                  className="mt-2 w-full rounded-md border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent"
                />
              )}
              <p className="mt-2 text-xs text-muted">Después lo podés mover igual, arrastrando en la barra lateral: la estructura se mantiene.</p>
            </div>

            {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={!!busy} onClick={() => setPlan(null)} className="rounded-md border border-line px-3 py-2 hover:bg-hover">
                Cancelar
              </button>
              <button type="button" disabled={!!busy} onClick={run} className="flex flex-1 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 font-medium text-accent-fg disabled:opacity-60">
                {busy && <Loader2 size={15} className="animate-spin" />}
                {progress ? `Importando… ${progress[0]} de ${progress[1]}` : 'Importar'}
              </button>
            </div>
          </section>
        )}

        {error && !plan && <p className="mt-3 text-sm text-red-600 dark:text-red-400">No se pudo leer el archivo: {error}</p>}

        {result && (
          <div className="rounded-lg bg-hover p-4 text-sm">
            <p className="mb-1 flex items-center gap-2 font-medium">
              <CheckCircle2 size={16} className="text-green-600" /> Listo
            </p>
            <p className="text-muted">
              {result.pages} páginas, {result.databases} bases de datos con {result.rows} filas y {result.images} imágenes.
            </p>
            {result.skipped.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                No se pudieron traer: {result.skipped.slice(0, 5).join(', ')}
                {result.skipped.length > 5 && ` y ${result.skipped.length - 5} más`} (formato no compatible, por ejemplo fotos HEIC del iPhone).
              </p>
            )}
            <div className="mt-3 flex gap-2">
              {result.firstId && (
                <button
                  type="button"
                  onClick={() => navigate({ to: '/p/$pageId', params: { pageId: result.firstId! } })}
                  className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-fg"
                >
                  Ver lo importado
                </button>
              )}
              <button type="button" onClick={() => setResult(null)} className="rounded-md border border-line px-3 py-1.5 hover:bg-bg">
                Importar otro
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

/** Pages as an indented list, for the destination picker. */
function flatten(pages: Page[]) {
  const kids = new Map<string | null, Page[]>()
  for (const p of pages) kids.set(p.parent_id, [...(kids.get(p.parent_id) ?? []), p])
  const out: { page: Page; depth: number }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const p of (kids.get(parent) ?? []).sort(bySortKey)) {
      out.push({ page: p, depth })
      if (depth < 3) walk(p.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

function TreeNode({ node, depth, exclude, onToggle }: { node: PlanNode; depth: number; exclude: Set<string>; onToggle: (key: string) => void }) {
  const [open, setOpen] = useState(depth < 2)
  const off = exclude.has(node.key)
  return (
    <div>
      <div className={cx('flex items-center gap-1.5 rounded py-0.5 hover:bg-hover', off && 'opacity-40')} style={{ paddingLeft: depth * 18 }}>
        <button type="button" onClick={() => setOpen(!open)} className={cx('rounded p-0.5 text-muted', !node.children.length && 'invisible')}>
          <ChevronRight size={13} className={cx('transition-transform', open && 'rotate-90')} />
        </button>
        <input type="checkbox" checked={!off} onChange={() => onToggle(node.key)} />
        {node.kind === 'database' ? <Database size={14} className="text-muted" /> : <FileText size={14} className="text-muted" />}
        <span className={cx('min-w-0 flex-1 truncate', off && 'line-through')}>{node.title}</span>
        {node.rows > 0 && <span className="text-xs text-muted">{node.rows} filas</span>}
        {node.images > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-muted">
            <Image size={11} /> {node.images}
          </span>
        )}
      </div>
      {open && !off && node.children.map((c) => <TreeNode key={c.key} node={c} depth={depth + 1} exclude={exclude} onToggle={onToggle} />)}
    </div>
  )
}
