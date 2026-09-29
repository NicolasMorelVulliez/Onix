import { useNavigate } from '@tanstack/react-router'
import { CheckCircle2, FileArchive, Loader2, Upload } from 'lucide-react'
import { useState } from 'react'
import { importNotionZip, type ImportResult } from '../lib/notion-import'
import { TopBar } from './TopBar'

export function ImportPage() {
  const navigate = useNavigate()
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (file: File) => {
    setError(null)
    setResult(null)
    setProgress([0, 1])
    try {
      setResult(await importNotionZip(file, (d, t) => setProgress([d, t])))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setProgress(null)
  }

  return (
    <>
      <TopBar>
        <span className="text-sm">Importar de Notion</span>
      </TopBar>
      <div className="mx-auto max-w-3xl px-12 pb-24 pt-12 max-md:px-4 max-md:pt-6">
        <h1 className="page-title mb-2 text-3xl font-bold">Importar de Notion</h1>
        <p className="mb-6 text-sm text-muted">Trae tus páginas, subpáginas y bases de datos. Todo se procesa en tu navegador.</p>

        <section className="mb-6 rounded-lg border border-line p-4 text-sm">
          <h2 className="mb-2 font-semibold">1. Exportá desde Notion (en la compu)</h2>
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>
              En Notion: <b className="text-fg">Configuración → Espacio de trabajo → General → Exportar todo el contenido</b>. Para una sola página:{' '}
              <b className="text-fg">⋯ → Exportar</b>.
            </li>
            <li>
              Formato: <b className="text-fg">Markdown y CSV</b>. Activá <b className="text-fg">Incluir subpáginas</b> y{' '}
              <b className="text-fg">Crear carpetas para subpáginas</b>. Contenido: <b className="text-fg">Todo</b>.
            </li>
            <li>Notion te manda un mail con el link: descargá el archivo .zip (no hace falta descomprimirlo).</li>
          </ol>
        </section>

        <section className="rounded-lg border border-line p-4 text-sm">
          <h2 className="mb-3 font-semibold">2. Subí el .zip</h2>
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f && !progress) run(f)
            }}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line px-4 py-10 text-center text-muted hover:bg-hover"
          >
            {progress ? <Loader2 size={28} className="animate-spin text-accent" /> : <FileArchive size={28} />}
            {progress ? (
              <span>
                Importando… {progress[0]} de {progress[1]}
              </span>
            ) : (
              <span>
                Arrastrá el archivo acá o <span className="text-accent">elegilo</span>
              </span>
            )}
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={!!progress}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) run(f)
                e.target.value = ''
              }}
              className="hidden"
            />
          </label>
          {error && <p className="mt-3 text-red-600 dark:text-red-400">No se pudo importar: {error}</p>}
          {result && (
            <div className="mt-4 rounded-md bg-hover p-3">
              <p className="mb-1 flex items-center gap-2 font-medium">
                <CheckCircle2 size={16} className="text-green-600" /> Listo
              </p>
              <p className="text-muted">
                {result.pages} páginas, {result.databases} bases de datos con {result.rows} filas y {result.images} imágenes. Quedó todo dentro
                de <b className="text-fg">📥 Importado de Notion</b>, así lo podés reorganizar arrastrando en la barra lateral.
              </p>
              {result.skipped.length > 0 && <p className="mt-1 text-xs text-muted">No se pudieron leer {result.skipped.length} imágenes.</p>}
              <button
                type="button"
                onClick={() => navigate({ to: '/p/$pageId', params: { pageId: result.rootId } })}
                className="mt-2 flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-accent-fg"
              >
                <Upload size={14} className="rotate-90" /> Ver lo importado
              </button>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            Los PDF y otros adjuntos no se copian: subilos a Google Drive y vinculalos con /drive. Las relaciones entre bases quedan como texto.
          </p>
        </section>
      </div>
    </>
  )
}
