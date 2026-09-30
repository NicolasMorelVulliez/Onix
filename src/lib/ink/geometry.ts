import { getStroke, type StrokeOptions } from 'perfect-freehand'
import type { Paper, Stroke } from './types'

// ---------- Stroke shape ----------

export const HIGHLIGHT_OPACITY = 0.4

function options(s: Pick<Stroke, 'tool' | 'size' | 'pressure'>, last: boolean): StrokeOptions {
  return s.tool === 'highlighter'
    ? { size: s.size, thinning: 0, smoothing: 0.5, streamline: 0.4, simulatePressure: false, last }
    : { size: s.size, thinning: 0.5, smoothing: 0.6, streamline: 0.3, simulatePressure: !s.pressure, last }
}

/** Filled outline of a stroke (perfect-freehand), as [x, y] points. */
export function outline(s: Pick<Stroke, 'tool' | 'size' | 'pressure' | 'points'>, last = true): number[][] {
  const input: number[][] = []
  const real = s.pressure && s.tool === 'pen'
  for (let i = 0; i < s.points.length; i += 3) input.push([s.points[i], s.points[i + 1], real ? s.points[i + 2] : 0.5])
  return getStroke(input, options(s, last))
}

/**
 * Closed smooth curve through the outline points: quadratic segments between midpoints.
 * Returns the start point and [controlX, controlY, x, y] per segment.
 */
export function smoothClosed(pts: number[][]): { start: number[]; quads: number[] } | null {
  const n = pts.length
  if (n < 3) return null
  const quads: number[] = []
  const start = [(pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2]
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % n]
    quads.push(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
  }
  return { start, quads }
}

const r2 = (v: number) => Math.round(v * 100) / 100

export function svgPath(pts: number[][]): string {
  const c = smoothClosed(pts)
  if (!c) return ''
  let d = `M${r2(c.start[0])} ${r2(c.start[1])}`
  const q = c.quads
  for (let i = 0; i < q.length; i += 4) d += `Q${r2(q[i])} ${r2(q[i + 1])} ${r2(q[i + 2])} ${r2(q[i + 3])}`
  return `${d}Z`
}

const paths = new WeakMap<Stroke, string>()
/** SVG path of a finished stroke, cached (strokes are never mutated). */
export function strokePath(s: Stroke) {
  let d = paths.get(s)
  if (d === undefined) {
    d = svgPath(outline(s))
    paths.set(s, d)
  }
  return d
}

/**
 * Drops samples closer than `min` to the previous one: the pencil reports up to 240 per second,
 * and the curve looks the same with far fewer (smaller PDFs, lighter pages).
 */
export function thinPoints(points: number[], min = 0.35): number[] {
  if (points.length <= 6) return points.map(r2)
  const out = [r2(points[0]), r2(points[1]), r2(points[2])]
  let lx = points[0]
  let ly = points[1]
  for (let i = 3; i < points.length; i += 3) {
    const last = i === points.length - 3
    const dx = points[i] - lx
    const dy = points[i + 1] - ly
    if (!last && dx * dx + dy * dy < min * min) continue
    out.push(r2(points[i]), r2(points[i + 1]), r2(points[i + 2]))
    lx = points[i]
    ly = points[i + 1]
  }
  return out
}

// ---------- Hit testing ----------

export type Box = [number, number, number, number]

/** Bounding box of the stroke's centerline, grown by its half width. */
export function strokeBox(s: Stroke): Box {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < s.points.length; i += 3) {
    const x = s.points[i]
    const y = s.points[i + 1]
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  const pad = s.size * 0.75
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]
}

function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0
  const x = ax + t * dx - px
  const y = ay + t * dy - py
  return x * x + y * y
}

/** Whether a circle of radius r at (x, y) touches the stroke. */
export function touches(s: Stroke, x: number, y: number, r: number): boolean {
  const reach = r + s.size * 0.6
  const [x0, y0, x1, y1] = strokeBox(s)
  if (x < x0 - r || x > x1 + r || y < y0 - r || y > y1 + r) return false
  const p = s.points
  if (p.length <= 3) return (p[0] - x) ** 2 + (p[1] - y) ** 2 <= reach * reach
  for (let i = 0; i + 3 < p.length; i += 3) {
    if (segDist2(x, y, p[i], p[i + 1], p[i + 3], p[i + 4]) <= reach * reach) return true
  }
  return false
}

/** Ray casting; poly = x, y, x, y… */
export function inPolygon(x: number, y: number, poly: number[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i]
    const yi = poly[i + 1]
    const xj = poly[j]
    const yj = poly[j + 1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** A stroke is lassoed when most of it is inside the loop. */
export function inLasso(s: Stroke, poly: number[]): boolean {
  let inside = 0
  const n = s.points.length / 3
  for (let i = 0; i < s.points.length; i += 3) if (inPolygon(s.points[i], s.points[i + 1], poly)) inside++
  return inside / n >= 0.6
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null
  return boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])])
}

export function moveStroke(s: Stroke, dx: number, dy: number): Stroke {
  const points = s.points.slice()
  for (let i = 0; i < points.length; i += 3) {
    points[i] = r2(points[i] + dx)
    points[i + 1] = r2(points[i + 1] + dy)
  }
  return { ...s, points }
}

// ---------- Paper ----------

export const PAPER_LINE = '#c3cfdc'
export const A4: [number, number] = [595.28, 841.89]
const MM = 72 / 25.4

export const PAPERS: { id: Paper; name: string }[] = [
  { id: 'ruled', name: 'Rayada' },
  { id: 'grid', name: 'Cuadriculada' },
  { id: 'dots', name: 'Puntos' },
  { id: 'blank', name: 'Lisa' },
]

/**
 * Lines (x1, y1, x2, y2…) and dots (x, y…) of a sheet, in page coordinates. The same geometry
 * is drawn on screen (SVG) and into the PDF, so the paper looks the same everywhere.
 */
export function paperGeometry(paper: Paper, w: number, h: number): { lines: number[]; dots: number[] } {
  const lines: number[] = []
  const dots: number[] = []
  if (paper === 'ruled') {
    const gap = 8 * MM
    for (let y = 22 * MM; y < h - 10 * MM; y += gap) lines.push(0, r2(y), r2(w), r2(y))
  } else if (paper === 'grid' || paper === 'dots') {
    const gap = 5 * MM
    const ox = (w % gap) / 2
    const oy = (h % gap) / 2
    if (paper === 'grid') {
      for (let x = ox; x <= w; x += gap) lines.push(r2(x), 0, r2(x), r2(h))
      for (let y = oy; y <= h; y += gap) lines.push(0, r2(y), r2(w), r2(y))
    } else {
      for (let x = ox + gap; x < w - gap / 2; x += gap) for (let y = oy + gap; y < h - gap / 2; y += gap) dots.push(r2(x), r2(y))
    }
  }
  return { lines, dots }
}
