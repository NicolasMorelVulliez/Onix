import { useNavigate, useRouter } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, Loader2, Share, X } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { db } from '../../lib/db'
import { buildPdf, imagesToPdf } from '../../lib/ink/client'
import { A4, moveStroke, unionBox, strokeBox } from '../../lib/ink/geometry'
import { openPdf, rasterize } from '../../lib/ink/pdfjs'
import { fileAsPdf, fileMeta } from '../../lib/google'
import { displayName, fetchFromDrive, importPdf, loadDoc, localSaver, refreshFromDrive, scheduleUpload, sheet, UnreadablePdf, uploadDoc, useInkStatus } from '../../lib/ink/store'
import type { InkDoc, InkPage, Paper } from '../../lib/ink/types'
import { uid } from '../../lib/util'
import { InkCanvas, type CanvasApi } from './InkCanvas'
import type { Selection } from './InkSheet'
import { InkToolbar, SelectionBar } from './InkToolbar'

const replace = (pages: InkPage[], i: number, fn: (p: InkPage) => InkPage) => pages.map((p, j) => (j === i ? fn(p) : p))

export interface InkSearch {
  /** Google account and Drive file, to download it when it isn't on this device yet. */
  a?: string
  f?: string
  /** Folder where it was opened (a class folder, for example). */
  d?: string
}

/** Full-screen notebook: write with the pencil on a PDF or on paper. */
export function InkEditor({ docId, search }: { docId: string; search: InkSearch }) {
  const navigate = useNavigate()
  const router = useRouter()
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error' | 'convert'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [doc, setDoc] = useState<InkDoc | null>(null)
  const [pages, setPages] = useState<InkPage[]>([])
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [exported, setExported] = useState<File | null>(null)
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const history = useRef({ undo: [] as InkPage[][], redo: [] as InkPage[][] })
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  const saver = useRef<((pages: InkPage[]) => Promise<void>) | null>(null)
  const unsaved = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const canvas = useRef<CanvasApi | null>(null)
  const status = useInkStatus((s) => s[docId])
  const account = useLiveQuery(() => (doc?.account_id ? db.google_accounts.get(doc.account_id) : undefined), [doc?.account_id])

  // ---------- Saving: on this device right away, to Drive a few seconds later ----------

  const saveNow = useCallback(async () => {
    clearTimeout(timer.current)
    if (!unsaved.current || !saver.current) return
    unsaved.current = false
    await saver.current(pagesRef.current)
    const row = await db.ink.get(docId)
    if (row?.account_id) scheduleUpload(docId)
  }, [docId])

  const changed = useCallback(() => {
    unsaved.current = true
    if (useInkStatus.getState()[docId]?.state !== 'local') useInkStatus.setState({ [docId]: { state: 'pending' } })
    clearTimeout(timer.current)
    timer.current = setTimeout(saveNow, 700)
  }, [docId, saveNow])

  // ---------- Opening ----------

  useEffect(() => {
    let stop = false
    let opened: PDFDocumentProxy | null = null
    ;(async () => {
      let loaded = await loadDoc(docId)
      if (!loaded && search.a && search.f) {
        setMessage('Descargando de Drive…')
        await fetchFromDrive(docId, search.a, search.f, search.d)
        loaded = await loadDoc(docId)
      } else if (loaded && !loaded.doc.dirty && navigator.onLine) {
        // Written on another device? A quick look; without connection it opens what's here.
        let gaveUp = false
        const fresh = await Promise.race([
          refreshFromDrive(loaded.doc, () => gaveUp).catch(() => false),
          new Promise<false>((r) => setTimeout(() => r(false), 4000)),
        ])
        gaveUp = true
        if (fresh) loaded = await loadDoc(docId)
      }
      if (stop) return
      if (!loaded) throw new Error('Este cuaderno no está en este dispositivo.')
      if (loaded.doc.base && loaded.pages.some((p) => p.paper === null)) {
        setMessage('Abriendo el PDF…')
        opened = await openPdf(loaded.doc.base)
        if (stop) return void opened.loadingTask.destroy()
      }
      saver.current = localSaver(docId, loaded.pages)
      setPdf(opened)
      setDoc(loaded.doc)
      setPages(loaded.pages)
      setPhase('ready')
      const { doc } = loaded
      useInkStatus.setState({ [docId]: { state: !doc.account_id ? 'local' : doc.dirty ? 'pending' : 'saved' } })
      if (doc.dirty && doc.account_id) scheduleUpload(docId, 1500)
    })().catch((e) => {
      if (stop) return
      setMessage(e instanceof Error ? e.message : String(e))
      // Some PDFs can't be written on as they are: those can be turned into images.
      setPhase(e instanceof UnreadablePdf ? 'convert' : 'error')
    })
    return () => {
      stop = true
      opened?.loadingTask.destroy()
    }
  }, [docId, search.a, search.f, search.d])

  // Leaving the editor or the app (iPad home button): save and upload now.
  useEffect(() => {
    const flush = () => saveNow().then(() => uploadDoc(docId))
    const onHide = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [docId, saveNow])

  // ---------- Editing ----------

  const commit = useCallback(
    (next: InkPage[], before: InkPage[]) => {
      const h = history.current
      h.undo.push(before)
      if (h.undo.length > 200) h.undo.shift()
      h.redo = []
      pagesRef.current = next
      setPages(next)
      changed()
      rerender()
    },
    [changed],
  )
  const preview = useCallback((next: InkPage[]) => {
    pagesRef.current = next
    setPages(next)
  }, [])

  const travel = useCallback(
    (from: 'undo' | 'redo') => {
      const h = history.current
      const target = h[from].pop()
      if (!target) return
      h[from === 'undo' ? 'redo' : 'undo'].push(pagesRef.current)
      pagesRef.current = target
      setPages(target)
      setSelection(null)
      changed()
      rerender()
    },
    [changed],
  )

  const withSelection = (fn: (sel: Selection, page: InkPage) => InkPage['strokes'] | null) => {
    const sel = selection
    if (!sel) return
    const cur = pagesRef.current
    const strokes = fn(sel, cur[sel.page])
    if (strokes) commit(replace(cur, sel.page, (p) => ({ ...p, strokes })), cur)
  }
  const deleteSelection = () => {
    withSelection((sel, p) => p.strokes.filter((s) => !sel.ids.has(s.id)))
    setSelection(null)
  }
  const recolor = (color: string) => withSelection((sel, p) => p.strokes.map((s) => (sel.ids.has(s.id) && s.tool === 'pen' ? { ...s, color } : s)))
  const duplicate = () => {
    const sel = selection
    if (!sel) return
    const copies = pagesRef.current[sel.page].strokes.filter((s) => sel.ids.has(s.id)).map((s) => ({ ...moveStroke(s, 14, 14), id: uid() }))
    withSelection((_, p) => [...p.strokes, ...copies])
    setSelection({ page: sel.page, ids: new Set(copies.map((c) => c.id)), box: unionBox(copies.map(strokeBox))!, dx: 0, dy: 0 })
  }

  const addPage = (paper: Paper) => {
    const cur = pagesRef.current
    const ref = cur[pageIndex]
    const at = pageIndex + 1
    setSelection(null)
    commit([...cur.slice(0, at), sheet(paper, ref ? [ref.width, ref.height] : A4), ...cur.slice(at)], cur)
    setTimeout(() => canvas.current?.scrollToPage(at), 60)
  }
  const deletePage = () => {
    const cur = pagesRef.current
    if (cur.length < 2 || !confirm(`¿Borrar la página ${pageIndex + 1}? Podés deshacerlo.`)) return
    setSelection(null)
    commit(
      cur.filter((_, i) => i !== pageIndex),
      cur,
    )
  }

  // Keyboard (iPad with keyboard, Mac).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable]')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        travel(e.shiftKey ? 'redo' : 'undo')
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        travel('redo')
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && selection) {
        e.preventDefault()
        deleteSelection()
      } else if (e.key === 'Escape') setSelection(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---------- Export ----------

  const share = async () => {
    await saveNow()
    const loaded = await loadDoc(docId)
    if (!loaded) return
    const bytes = await buildPdf(loaded.doc.base, loaded.pages, displayName(loaded.doc.name))
    // Safari only shares right after a tap: the file is prepared first, then shared with another tap.
    setExported(new File([bytes as Uint8Array<ArrayBuffer>], loaded.doc.name, { type: 'application/pdf' }))
  }

  const convert = async () => {
    if (!search.a || !search.f) return
    setPhase('loading')
    try {
      setMessage('Preparando el PDF para escribir…')
      const meta = await fileMeta(search.a, search.f)
      const images = await rasterize(await fileAsPdf(search.a, meta), (d, t) => setMessage(`Preparando página ${d} de ${t}…`))
      const bytes = await imagesToPdf(images, displayName(meta.name))
      const id = await importPdf(new File([bytes as Uint8Array<ArrayBuffer>], `${displayName(meta.name)} (para escribir).pdf`), {
        accountId: search.a,
        folderId: search.d ?? meta.parents?.[0] ?? null,
      })
      navigate({ to: '/ink/$docId', params: { docId: id }, replace: true })
    } catch (e) {
      setPhase('error')
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  const back = () => (router.history.length > 1 ? router.history.back() : navigate({ to: '/' }))
  const h = history.current

  return (
    <div className="fixed inset-0 z-[45] flex flex-col bg-bg">
      {phase === 'ready' && doc ? (
        <>
          <InkToolbar
            title={displayName(doc.name)}
            status={status}
            canUndo={h.undo.length > 0}
            canRedo={h.redo.length > 0}
            onBack={back}
            onUndo={() => travel('undo')}
            onRedo={() => travel('redo')}
            onAddPage={addPage}
            onDeletePage={pages.length > 1 ? deletePage : null}
            onShare={share}
            onRetry={() => saveNow().then(() => uploadDoc(docId))}
            driveUrl={doc.file_id ? `https://drive.google.com/file/d/${doc.file_id}/view?authuser=${encodeURIComponent(account?.email ?? '')}` : null}
          />
          <div className="relative min-h-0 flex-1">
            <InkCanvas
              pages={pages}
              pdf={pdf}
              selection={selection}
              onSelection={setSelection}
              onPreview={preview}
              onCommit={commit}
              onPage={setPageIndex}
              onZoom={setZoom}
              apiRef={canvas}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2">
              {selection && <SelectionBar onDelete={deleteSelection} onDuplicate={duplicate} onColor={recolor} />}
              <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                <span>
                  {pageIndex + 1} / {pages.length}
                </span>
                {Math.abs(zoom - 1) > 0.02 && (
                  <button type="button" onClick={() => canvas.current?.resetZoom()} className="ml-1 rounded-full bg-white/20 px-1.5">
                    {Math.round(zoom * 100)}%
                  </button>
                )}
              </div>
            </div>
          </div>
          {exported && <ExportCard file={exported} onClose={() => setExported(null)} />}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm">
          {phase === 'loading' && <Loader2 className="animate-spin text-muted" />}
          <p className={phase === 'loading' ? 'text-muted' : ''}>{message ?? (phase === 'loading' ? 'Abriendo…' : '')}</p>
          {phase === 'convert' && (
            <>
              <p className="max-w-sm text-muted">Este PDF no se puede anotar tal como está. Puedo hacer una copia (las páginas como imágenes) para escribir encima.</p>
              {search.f && (
                <button type="button" onClick={convert} className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-fg">
                  Crear la copia para escribir
                </button>
              )}
            </>
          )}
          {phase !== 'loading' && (
            <button type="button" onClick={back} className="rounded-md border border-line px-3 py-1.5 hover:bg-hover">
              Volver
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ExportCard({ file, onClose }: { file: File; onClose: () => void }) {
  const canShare = !!navigator.canShare?.({ files: [file] })
  const download = () => {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 flex items-center gap-2 rounded-xl border border-line bg-elevated p-2 pl-3 text-sm shadow-pop">
      <span className="max-w-48 truncate">{file.name}</span>
      {canShare && (
        <button type="button" onClick={() => navigator.share({ files: [file] }).catch(() => {})} className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 font-medium text-accent-fg">
          <Share size={14} /> Compartir
        </button>
      )}
      <button type="button" onClick={download} className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 hover:bg-hover">
        <Download size={14} /> Descargar
      </button>
      <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded p-1 text-muted hover:bg-hover">
        <X size={15} />
      </button>
    </div>
  )
}
