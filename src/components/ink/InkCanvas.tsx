import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { HIGHLIGHT_OPACITY, inLasso, moveStroke, outline, strokeBox, svgPath, thinPoints, touches, unionBox } from '../../lib/ink/geometry'
import { useInkTools } from '../../lib/ink/tools'
import type { InkPage, Pen, Stroke } from '../../lib/ink/types'
import { uid } from '../../lib/util'
import { InkSheet, type Selection } from './InkSheet'

const PAD = 16
/** Space between pages, in page points. */
const GAP = 14
const MIN_ZOOM = 0.5
const MAX_ZOOM = 5
/** A finger right after the pencil is the palm resting on the screen. */
const PALM_MS = 500

export interface CanvasApi {
  scrollToPage: (index: number) => void
  resetZoom: () => void
}

type InkGesture =
  | { kind: 'draw'; id: number; page: number; points: number[]; tool: Pen; color: string; size: number; pressure: boolean; started: number }
  | { kind: 'erase'; id: number; page: number; before: InkPage[]; x: number; y: number }
  | { kind: 'lasso'; id: number; page: number; poly: number[] }
  | { kind: 'move'; id: number; page: number; x0: number; y0: number }

type TouchGesture =
  | { kind: 'pan'; x: number; y: number; t: number; vx: number; vy: number }
  | { kind: 'pinch'; dist: number; zoom: number; docX: number; docY: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const replace = (pages: InkPage[], i: number, fn: (p: InkPage) => InkPage) => pages.map((p, j) => (j === i ? fn(p) : p))

/**
 * The pages, the pencil and the gestures. The pencil (or mouse) writes with the chosen tool;
 * fingers scroll and pinch to zoom, unless "draw with the finger" is on. Touches right after the
 * pencil are ignored (palm). The stroke being drawn is painted directly into an overlay, and
 * only becomes React state when the pencil lifts.
 */
export function InkCanvas({
  pages,
  pdf,
  selection,
  onSelection,
  onPreview,
  onCommit,
  onPage,
  onZoom,
  apiRef,
}: {
  pages: InkPage[]
  pdf: PDFDocumentProxy | null
  selection: Selection | null
  onSelection: (s: Selection | null) => void
  /** Pages changed during a gesture (not yet an undo step). */
  onPreview: (pages: InkPage[]) => void
  /** A finished change: `before` is what undo goes back to. */
  onCommit: (pages: InkPage[], before: InkPage[]) => void
  onPage: (index: number) => void
  onZoom: (zoom: number) => void
  apiRef: RefObject<CanvasApi | null>
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const overlay = useRef<SVGSVGElement>(null)
  const livePath = useRef<SVGPathElement>(null)
  const lassoLine = useRef<SVGPolylineElement>(null)
  const eraserDot = useRef<SVGCircleElement>(null)
  const [view, setView] = useState({ w: 0, h: 0, top: 0 })
  const [zoom, setZoom] = useState(1)

  const maxW = Math.max(1, ...pages.map((p) => p.width))
  const fit = view.w ? Math.min((view.w - 2 * PAD) / maxW, 1000 / maxW) : 1
  const scale = fit * zoom
  const layout = useMemo(() => {
    const width = Math.max(view.w, maxW * scale + 2 * PAD)
    let y = PAD
    const boxes = pages.map((p) => {
      const w = p.width * scale
      const h = p.height * scale
      const b = { x: (width - w) / 2, y, w, h }
      y += h + GAP * scale
      return b
    })
    return { boxes, width, height: y - GAP * scale + PAD, scale }
  }, [pages, scale, view.w, maxW])

  // Handlers run outside React: they read the latest values from here.
  const live = useRef({ pages, layout, selection, zoom, onPreview, onCommit, onSelection })
  live.current = { pages, layout, selection, zoom, onPreview, onCommit, onSelection }
  const anchor = useRef<{ docX: number; docY: number; mx: number; my: number } | null>(null)
  const clearLive = useRef(false)

  // Zooming keeps the point under the fingers (or the cursor) still.
  useLayoutEffect(() => {
    const a = anchor.current
    const el = scroller.current
    if (!a || !el) return
    anchor.current = null
    el.scrollLeft = a.docX * layout.scale + layout.width / 2 - a.mx
    el.scrollTop = a.docY * layout.scale + PAD - a.my
  }, [layout])

  // The stroke drawn in the overlay is now a real stroke on the page.
  useLayoutEffect(() => {
    if (!clearLive.current) return
    clearLive.current = false
    livePath.current?.setAttribute('d', '')
  }, [pages])

  useEffect(() => onZoom(zoom), [zoom, onZoom])

  const first = layout.boxes.findIndex((b) => b.y + b.h >= view.top - view.h)
  const lastVisible = layout.boxes.findLastIndex((b) => b.y <= view.top + 2 * view.h)
  const middle = view.top + view.h / 2
  const current = Math.max(0, layout.boxes.findLastIndex((b) => b.y <= middle))
  useEffect(() => onPage(current), [current, onPage])

  useEffect(() => {
    apiRef.current = {
      scrollToPage: (i) => {
        const b = live.current.layout.boxes[i]
        if (b && scroller.current) scroller.current.scrollTop = b.y - PAD
      },
      resetZoom: () => {
        const el = scroller.current!
        const L = live.current.layout
        anchor.current = { docX: (el.scrollLeft + el.clientWidth / 2 - L.width / 2) / L.scale, docY: (el.scrollTop + el.clientHeight / 2 - PAD) / L.scale, mx: el.clientWidth / 2, my: el.clientHeight / 2 }
        setZoom(1)
      },
    }
  }, [apiRef])

  useEffect(() => {
    const el = scroller.current!
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setView((v) => (v.top === el.scrollTop ? v : { ...v, top: el.scrollTop })))
    }
    const measure = () => {
      const L = live.current.layout
      // Turning the iPad: stay on the same spot of the same page.
      if (L.scale && el.clientWidth) {
        anchor.current = { docX: (el.scrollLeft + el.clientWidth / 2 - L.width / 2) / L.scale, docY: (el.scrollTop - PAD) / L.scale, mx: el.clientWidth / 2, my: 0 }
      }
      setView({ w: el.clientWidth, h: el.clientHeight, top: el.scrollTop })
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  // ---------- Input ----------
  useEffect(() => {
    const el = scroller.current!
    let ink: InkGesture | null = null
    let touch: TouchGesture | null = null
    const fingers = new Map<number, { x: number; y: number }>()
    const ignored = new Set<number>()
    let lastPen = -Infinity
    let momentum = 0
    let frame = 0
    let predicted: number[] = []
    let inkByFinger = false
    /** Where the drawing pointer is, on screen. */
    let inkAt = { x: 0, y: 0 }

    const tools = () => useInkTools.getState()
    const capture = (id: number) => {
      try {
        el.setPointerCapture(id)
      } catch {
        // The pointer is already gone (a very quick tap).
      }
    }

    /** Page under a pointer (or the given page), in page coordinates. */
    const at = (e: { clientX: number; clientY: number }, page?: number) => {
      const { layout: L } = live.current
      const r = el.getBoundingClientRect()
      const cx = e.clientX - r.left + el.scrollLeft
      const cy = e.clientY - r.top + el.scrollTop
      const i = page ?? L.boxes.findIndex((b) => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h)
      if (i < 0) return null
      const b = L.boxes[i]
      return { page: i, x: (cx - b.x) / L.scale, y: (cy - b.y) / L.scale }
    }

    const placeOverlay = (i: number) => {
      const svg = overlay.current!
      const b = live.current.layout.boxes[i]
      const p = live.current.pages[i]
      Object.assign(svg.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px`, display: 'block' })
      svg.setAttribute('viewBox', `0 0 ${p.width} ${p.height}`)
    }

    const pressureOf = (e: PointerEvent) => (e.pointerType === 'pen' ? clamp(e.pressure || 0.5, 0.05, 1) : 0.5)

    const paintStroke = () => {
      frame = 0
      if (ink?.kind !== 'draw') return
      const d = svgPath(outline({ tool: ink.tool, size: ink.size, pressure: ink.pressure, points: predicted.length ? [...ink.points, ...predicted] : ink.points }, false))
      livePath.current!.setAttribute('d', d)
    }

    const eraseAt = (g: Extract<InkGesture, { kind: 'erase' }>, x: number, y: number) => {
      const r = tools().eraser
      // Fast movements: check along the way, not only where the events landed.
      const steps = Math.max(1, Math.ceil(Math.hypot(x - g.x, y - g.y) / (r / 2)))
      const page = live.current.pages[g.page]
      const hit = new Set<Stroke>()
      for (let k = 1; k <= steps; k++) {
        const px = g.x + ((x - g.x) * k) / steps
        const py = g.y + ((y - g.y) * k) / steps
        for (const s of page.strokes) if (!hit.has(s) && touches(s, px, py, r)) hit.add(s)
      }
      g.x = x
      g.y = y
      const dot = eraserDot.current!
      dot.setAttribute('cx', String(x))
      dot.setAttribute('cy', String(y))
      dot.setAttribute('r', String(r))
      if (!hit.size) return
      const next = replace(live.current.pages, g.page, (p) => ({ ...p, strokes: p.strokes.filter((s) => !hit.has(s)) }))
      live.current.pages = next
      live.current.onPreview(next)
    }

    const startInk = (e: PointerEvent) => {
      inkAt = { x: e.clientX, y: e.clientY }
      const hitPage = at(e)
      const sel = live.current.selection
      // Dragging the selection moves it.
      if (sel && hitPage?.page === sel.page) {
        const [x0, y0, x1, y1] = sel.box
        if (hitPage.x >= x0 - 8 && hitPage.x <= x1 + 8 && hitPage.y >= y0 - 8 && hitPage.y <= y1 + 8) {
          ink = { kind: 'move', id: e.pointerId, page: sel.page, x0: hitPage.x, y0: hitPage.y }
          return true
        }
      }
      if (sel) live.current.onSelection(null)
      if (!hitPage) return false
      const t = tools()
      if (t.tool === 'eraser') {
        placeOverlay(hitPage.page)
        ink = { kind: 'erase', id: e.pointerId, page: hitPage.page, before: live.current.pages, x: hitPage.x, y: hitPage.y }
        eraseAt(ink, hitPage.x, hitPage.y)
      } else if (t.tool === 'lasso') {
        placeOverlay(hitPage.page)
        ink = { kind: 'lasso', id: e.pointerId, page: hitPage.page, poly: [hitPage.x, hitPage.y] }
      } else {
        const pen = t.tool === 'highlighter' ? t.highlighter : t.pen
        placeOverlay(hitPage.page)
        const path = livePath.current!
        path.setAttribute('fill', pen.color)
        path.setAttribute('fill-opacity', t.tool === 'highlighter' ? String(HIGHLIGHT_OPACITY) : '1')
        path.style.mixBlendMode = t.tool === 'highlighter' ? 'multiply' : ''
        ink = {
          kind: 'draw',
          id: e.pointerId,
          page: hitPage.page,
          points: [hitPage.x, hitPage.y, pressureOf(e)],
          tool: t.tool,
          color: pen.color,
          size: pen.size,
          pressure: e.pointerType === 'pen',
          started: performance.now(),
        }
        paintStroke()
      }
      return true
    }

    const moveInk = (e: PointerEvent) => {
      if (!ink) return
      inkAt = { x: e.clientX, y: e.clientY }
      const events = e.getCoalescedEvents?.() ?? []
      const samples = events.length ? events : [e]
      if (ink.kind === 'draw') {
        for (const s of samples) {
          const p = at(s, ink.page)!
          ink.points.push(p.x, p.y, pressureOf(s))
        }
        predicted = []
        for (const s of (e.getPredictedEvents?.() ?? []).slice(0, 2)) {
          const p = at(s, ink.page)!
          predicted.push(p.x, p.y, pressureOf(s))
        }
        if (!frame) frame = requestAnimationFrame(paintStroke)
      } else if (ink.kind === 'erase') {
        for (const s of samples) {
          const p = at(s, ink.page)!
          eraseAt(ink, p.x, p.y)
        }
      } else if (ink.kind === 'lasso') {
        for (const s of samples) {
          const p = at(s, ink.page)!
          ink.poly.push(p.x, p.y)
        }
        lassoLine.current!.setAttribute('points', ink.poly.join(' '))
      } else {
        const p = at(e, ink.page)!
        const sel = live.current.selection
        if (sel) live.current.onSelection({ ...sel, dx: p.x - ink.x0, dy: p.y - ink.y0 })
      }
    }

    /** Commits right away in `live` too: the next stroke may start before React renders. */
    const commit = (next: InkPage[], before: InkPage[]) => {
      live.current.pages = next
      live.current.onCommit(next, before)
    }

    const endInk = (cancel: boolean) => {
      const g = ink
      ink = null
      cancelAnimationFrame(frame)
      frame = 0
      predicted = []
      if (!g) return
      const { pages: cur } = live.current
      if (g.kind === 'draw') {
        if (cancel && g.points.length < 9) {
          livePath.current!.setAttribute('d', '')
          return
        }
        const stroke: Stroke = { id: uid(), tool: g.tool, color: g.color, size: g.size, pressure: g.pressure, points: thinPoints(g.points) }
        clearLive.current = true
        commit(
          replace(cur, g.page, (p) => ({ ...p, strokes: [...p.strokes, stroke] })),
          cur,
        )
      } else if (g.kind === 'erase') {
        eraserDot.current!.setAttribute('r', '0')
        if (cur !== g.before) commit(cur, g.before)
      } else if (g.kind === 'lasso') {
        lassoLine.current!.setAttribute('points', '')
        const page = cur[g.page]
        const chosen = g.poly.length >= 6 ? page.strokes.filter((s) => inLasso(s, g.poly)) : []
        if (chosen.length) live.current.onSelection({ page: g.page, ids: new Set(chosen.map((s) => s.id)), box: unionBox(chosen.map(strokeBox))!, dx: 0, dy: 0 })
      } else {
        const sel = live.current.selection
        if (!sel || (!sel.dx && !sel.dy)) return
        const next = replace(cur, g.page, (p) => ({ ...p, strokes: p.strokes.map((s) => (sel.ids.has(s.id) ? moveStroke(s, sel.dx, sel.dy) : s)) }))
        commit(next, cur)
        const [x0, y0, x1, y1] = sel.box
        live.current.onSelection({ ...sel, box: [x0 + sel.dx, y0 + sel.dy, x1 + sel.dx, y1 + sel.dy], dx: 0, dy: 0 })
      }
    }

    // ---------- Fingers: scroll and zoom ----------

    const stopMomentum = () => cancelAnimationFrame(momentum)
    const glide = (vx: number, vy: number) => {
      let last = performance.now()
      const stepFn = (t: number) => {
        const dt = t - last
        last = t
        el.scrollLeft -= vx * dt
        el.scrollTop -= vy * dt
        const f = Math.pow(0.994, dt)
        vx *= f
        vy *= f
        if (Math.hypot(vx, vy) > 0.03) momentum = requestAnimationFrame(stepFn)
      }
      momentum = requestAnimationFrame(stepFn)
    }

    const docPoint = (mx: number, my: number) => {
      const L = live.current.layout
      return { docX: (el.scrollLeft + mx - L.width / 2) / L.scale, docY: (el.scrollTop + my - PAD) / L.scale }
    }

    const startTouchGesture = () => {
      const pts = [...fingers.values()]
      if (pts.length === 1) {
        touch = { kind: 'pan', x: pts[0].x, y: pts[0].y, t: performance.now(), vx: 0, vy: 0 }
      } else if (pts.length >= 2) {
        const [a, b] = pts
        const r = el.getBoundingClientRect()
        const { docX, docY } = docPoint((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top)
        touch = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: live.current.zoom, docX, docY }
      }
    }

    const moveTouch = () => {
      const pts = [...fingers.values()]
      if (touch?.kind === 'pan' && pts.length === 1) {
        const now = performance.now()
        const dx = pts[0].x - touch.x
        const dy = pts[0].y - touch.y
        el.scrollLeft -= dx
        el.scrollTop -= dy
        const dt = Math.max(1, now - touch.t)
        touch = { kind: 'pan', x: pts[0].x, y: pts[0].y, t: now, vx: 0.7 * (dx / dt) + 0.3 * touch.vx, vy: 0.7 * (dy / dt) + 0.3 * touch.vy }
      } else if (touch?.kind === 'pinch' && pts.length >= 2) {
        const [a, b] = pts
        const r = el.getBoundingClientRect()
        const z = clamp((touch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / touch.dist, MIN_ZOOM, MAX_ZOOM)
        anchor.current = { docX: touch.docX, docY: touch.docY, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top }
        setZoom(z)
      }
    }

    // ---------- Pointer events ----------

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        lastPen = performance.now()
        // The palm may have started a scroll before the pencil touched the screen.
        fingers.clear()
        touch = null
        stopMomentum()
      }
      if (e.pointerType === 'touch') {
        // The palm, resting while writing with the pencil or right after.
        if (performance.now() - lastPen < PALM_MS || (ink && !inkByFinger)) {
          ignored.add(e.pointerId)
          return
        }
        if (ink) {
          // A second finger right away: it was a pinch, not a stroke.
          if (ink.kind !== 'draw' || performance.now() - ink.started > 250) {
            ignored.add(e.pointerId)
            return
          }
          livePath.current!.setAttribute('d', '')
          fingers.set(ink.id, inkAt)
          ink = null
        } else if (tools().fingerDraws && !fingers.size) {
          if (startInk(e)) {
            inkByFinger = true
            capture(e.pointerId)
            e.preventDefault()
          }
          return
        }
        stopMomentum()
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        capture(e.pointerId)
        startTouchGesture()
        return
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (ink) return
      if (startInk(e)) {
        inkByFinger = false
        capture(e.pointerId)
        e.preventDefault()
      }
    }

    const move = (e: PointerEvent) => {
      if (ink && e.pointerId === ink.id) {
        e.preventDefault()
        moveInk(e)
      } else if (fingers.has(e.pointerId)) {
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        moveTouch()
      }
    }

    const up = (e: PointerEvent) => {
      if (e.pointerType === 'pen') lastPen = performance.now()
      if (ignored.delete(e.pointerId)) return
      if (ink && e.pointerId === ink.id) return endInk(e.type === 'pointercancel')
      if (!fingers.delete(e.pointerId)) return
      if (fingers.size) return startTouchGesture()
      const g = touch
      touch = null
      if (g?.kind === 'pan' && performance.now() - g.t < 80) glide(g.vx, g.vy)
    }

    // Trackpad and mouse: ctrl/⌘ + wheel (or a Mac trackpad pinch) zooms, the rest scrolls normally.
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      anchor.current = { ...docPoint(mx, my), mx, my }
      setZoom((z) => clamp(z * Math.exp(-e.deltaY * 0.01), MIN_ZOOM, MAX_ZOOM))
    }
    // Safari's own pinch events: never let them zoom the whole app.
    let gestureZoom = 1
    const gesture = (e: Event) => {
      e.preventDefault()
      const ge = e as Event & { scale?: number; clientX?: number; clientY?: number }
      if (fingers.size || ink) return
      if (e.type === 'gesturestart') gestureZoom = live.current.zoom
      else if (e.type === 'gesturechange' && ge.scale) {
        const r = el.getBoundingClientRect()
        const mx = (ge.clientX ?? r.left + r.width / 2) - r.left
        const my = (ge.clientY ?? r.top + r.height / 2) - r.top
        anchor.current = { ...docPoint(mx, my), mx, my }
        setZoom(clamp(gestureZoom * ge.scale, MIN_ZOOM, MAX_ZOOM))
      }
    }
    const noMenu = (e: Event) => e.preventDefault()

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('contextmenu', noMenu)
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) el.addEventListener(t, gesture)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('contextmenu', noMenu)
      for (const t of ['gesturestart', 'gesturechange', 'gestureend']) el.removeEventListener(t, gesture)
      stopMomentum()
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div
      ref={scroller}
      className="absolute inset-0 overflow-auto overscroll-none bg-[#e8e8e6] select-none dark:bg-[#161616]"
      style={{ touchAction: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
    >
      <div className="relative" style={{ width: layout.width, height: layout.height }}>
        {pages.map((p, i) => {
          const b = layout.boxes[i]
          return (
            <InkSheet
              key={p.key}
              page={p}
              x={b.x}
              y={b.y}
              w={b.w}
              h={b.h}
              scale={scale}
              visible={view.w > 0 && i >= first && i <= lastVisible}
              pdf={pdf}
              selection={selection?.page === i ? selection : null}
            />
          )
        })}
        <svg ref={overlay} preserveAspectRatio="none" className="pointer-events-none absolute" style={{ display: 'none' }}>
          <path ref={livePath} />
          <polyline ref={lassoLine} fill="rgba(0,122,255,0.08)" stroke="#007aff" strokeWidth={1.2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
          <circle ref={eraserDot} r={0} fill="rgba(0,0,0,0.06)" stroke="rgba(0,0,0,0.35)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  )
}
