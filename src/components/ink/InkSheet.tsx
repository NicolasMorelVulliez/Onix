import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { memo, useEffect, useMemo, useRef } from 'react'
import { HIGHLIGHT_OPACITY, paperGeometry, PAPER_LINE, strokePath, type Box } from '../../lib/ink/geometry'
import { MAX_PIXELS } from '../../lib/ink/pdfjs'
import type { InkPage, Paper, Stroke } from '../../lib/ink/types'

export interface Selection {
  page: number
  ids: Set<string>
  /** Page coordinates of the selected strokes. */
  box: Box
  /** Offset while dragging. */
  dx: number
  dy: number
}

/** One page: its background (PDF or paper) and the strokes on it. Off-screen pages are blank boxes. */
export const InkSheet = memo(function InkSheet({
  page,
  x,
  y,
  w,
  h,
  scale,
  visible,
  pdf,
  selection,
}: {
  page: InkPage
  x: number
  y: number
  w: number
  h: number
  scale: number
  visible: boolean
  pdf: PDFDocumentProxy | null
  selection: Selection | null
}) {
  return (
    <div className="absolute overflow-hidden bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_4px_14px_rgba(0,0,0,0.06)]" style={{ left: x, top: y, width: w, height: h }}>
      {visible && (page.paper ? <PaperLayer paper={page.paper} width={page.width} height={page.height} /> : pdf && page.source !== null && <PdfLayer pdf={pdf} index={page.source} scale={scale} />)}
      {visible && <InkLayer strokes={page.strokes} width={page.width} height={page.height} selection={selection} />}
    </div>
  )
})

const PaperLayer = memo(function PaperLayer({ paper, width, height }: { paper: Paper; width: number; height: number }) {
  const d = useMemo(() => {
    const { lines, dots } = paperGeometry(paper, width, height)
    let l = ''
    for (let i = 0; i < lines.length; i += 4) l += `M${lines[i]} ${lines[i + 1]}L${lines[i + 2]} ${lines[i + 3]}`
    let p = ''
    for (let i = 0; i < dots.length; i += 2) p += `M${dots[i]} ${dots[i + 1]}h0.01`
    return { l, p }
  }, [paper, width, height])
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
      {d.l && <path d={d.l} stroke={PAPER_LINE} strokeWidth={0.5} fill="none" />}
      {d.p && <path d={d.p} stroke={PAPER_LINE} strokeWidth={1.3} strokeLinecap="round" fill="none" />}
    </svg>
  )
})

/** Resolution steps of about 20%: small zoom changes don't re-render the page. */
const step = (v: number) => Math.pow(2, Math.round(Math.log2(v) * 4) / 4)

/** The PDF page rendered by pdf.js, sharp for the current zoom (up to what the device can hold). */
function PdfLayer({ pdf, index, scale }: { pdf: PDFDocumentProxy; index: number; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const res = step(scale * (window.devicePixelRatio || 1))
  const drawn = useRef(0)

  useEffect(() => {
    let task: RenderTask | null = null
    let stop = false
    // The first render is immediate; later ones wait for the zoom to settle.
    const t = setTimeout(
      async () => {
        const page = await pdf.getPage(index + 1)
        if (stop) return
        const unit = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: Math.min(res, Math.sqrt(MAX_PIXELS / (unit.width * unit.height))) })
        if (Math.abs(viewport.scale - drawn.current) < 0.01) return
        // Drawn off-screen first, so the page never flashes blank while zooming.
        const tmp = document.createElement('canvas')
        tmp.width = Math.floor(viewport.width)
        tmp.height = Math.floor(viewport.height)
        task = page.render({ canvas: tmp, viewport })
        try {
          await task.promise
        } catch {
          return
        } finally {
          task = null
        }
        const canvas = ref.current
        if (stop || !canvas) return
        canvas.width = tmp.width
        canvas.height = tmp.height
        canvas.getContext('2d')!.drawImage(tmp, 0, 0)
        tmp.width = tmp.height = 0
        drawn.current = viewport.scale
      },
      drawn.current ? 200 : 0,
    )
    return () => {
      stop = true
      clearTimeout(t)
      task?.cancel()
    }
  }, [pdf, index, res])

  // Canvases hold a lot of memory: free it as soon as the page scrolls away.
  useEffect(
    () => () => {
      const c = ref.current
      if (c) c.width = c.height = 0
    },
    [],
  )
  return <canvas ref={ref} className="absolute inset-0 size-full" />
}

const Strokes = memo(function Strokes({ strokes }: { strokes: Stroke[] }) {
  return strokes.map((s) =>
    s.tool === 'highlighter' ? (
      <path key={s.id} d={strokePath(s)} fill={s.color} fillOpacity={HIGHLIGHT_OPACITY} style={{ mixBlendMode: 'multiply' }} />
    ) : (
      <path key={s.id} d={strokePath(s)} fill={s.color} />
    ),
  )
})

function InkLayer({ strokes, width, height, selection }: { strokes: Stroke[]; width: number; height: number; selection: Selection | null }) {
  const [rest, chosen] = useMemo(() => {
    if (!selection) return [strokes, []]
    return [strokes.filter((s) => !selection.ids.has(s.id)), strokes.filter((s) => selection.ids.has(s.id))]
  }, [strokes, selection])
  const b = selection?.box
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
      <Strokes strokes={rest} />
      {selection && b && (
        <g transform={`translate(${selection.dx} ${selection.dy})`}>
          <Strokes strokes={chosen} />
          <rect
            x={b[0] - 4}
            y={b[1] - 4}
            width={b[2] - b[0] + 8}
            height={b[3] - b[1] + 8}
            fill="rgba(0,122,255,0.06)"
            stroke="#007aff"
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
    </svg>
  )
}
