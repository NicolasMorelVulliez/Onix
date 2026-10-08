/**
 * Reads and writes Onix's handwriting inside PDFs (runs in a worker, see worker.ts).
 *
 * Each stroke is a standard PDF ink annotation, so Drive, Preview, Acrobat or GoodNotes show it
 * too. It carries its appearance (the filled outline, as drawn in Onix) and, under /OnixInk, the
 * data Onix needs to keep editing it (pen, color, pressure). The page content is never touched:
 * opening a PDF strips Onix's annotations into editable strokes, saving writes them back.
 */
import {
  EncryptedPDFError,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFString,
  type PDFPage,
} from '@cantoo/pdf-lib'
import { HIGHLIGHT_OPACITY, outline, paperGeometry, PAPER_LINE, smoothClosed } from './geometry'
import type { InkPage, Paper, Stroke } from './types'

const INK = PDFName.of('OnixInk')
const PAPER = PDFName.of('OnixPaper')
const PAPERS: Paper[] = ['blank', 'ruled', 'grid', 'dots']

// ---------- Page coordinates ----------

type Matrix = [number, number, number, number, number, number]

/**
 * PDF user space → page as shown (top-left origin, rotation applied): the same transform as
 * pdf.js' viewport at scale 1, so strokes line up with what pdf.js renders.
 */
export function viewTransform(box: number[], rotate: number): { m: Matrix; width: number; height: number } {
  const [x0, y0, x1, y1] = box
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const [a, b, c, d] = rotate === 90 ? [0, 1, 1, 0] : rotate === 180 ? [-1, 0, 0, 1] : rotate === 270 ? [0, -1, -1, 0] : [1, 0, 0, -1]
  const turned = a === 0
  const ox = turned ? Math.abs(cy - y0) : Math.abs(cx - x0)
  const oy = turned ? Math.abs(cx - x0) : Math.abs(cy - y0)
  return {
    m: [a, b, c, d, ox - a * cx - c * cy, oy - b * cx - d * cy],
    width: turned ? y1 - y0 : x1 - x0,
    height: turned ? x1 - x0 : y1 - y0,
  }
}

export function invert([a, b, c, d, e, f]: Matrix): Matrix {
  const det = a * d - b * c
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}

const apply = (m: Matrix, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
const r2 = (v: number) => Math.round(v * 100) / 100

function numbers(doc: PDFDocument, value: unknown): number[] | null {
  const arr = doc.context.lookup(value as PDFRef)
  if (!(arr instanceof PDFArray)) return null
  const out: number[] = []
  for (let i = 0; i < arr.size(); i++) {
    const n = arr.lookup(i)
    if (!(n instanceof PDFNumber)) return null
    out.push(n.asNumber())
  }
  return out.length === 4 ? out : null
}

const normalize = ([x0, y0, x1, y1]: number[]) => [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]

/** The visible box (CropBox ∩ MediaBox, like pdf.js) and rotation of a page. */
function pageGeometry(doc: PDFDocument, page: PDFPage) {
  const media = normalize(numbers(doc, page.node.MediaBox()) ?? [0, 0, 612, 792])
  const crop = numbers(doc, page.node.CropBox())
  let box = media
  if (crop) {
    const c = normalize(crop)
    const i = [Math.max(c[0], media[0]), Math.max(c[1], media[1]), Math.min(c[2], media[2]), Math.min(c[3], media[3])]
    if (i[2] > i[0] && i[3] > i[1]) box = i
  }
  const raw = page.node.Rotate()?.asNumber() ?? 0
  const rotate = raw % 90 ? 0 : ((raw % 360) + 360) % 360
  return viewTransform(box, rotate)
}

// ---------- Reading ----------

interface StoredStroke {
  t: 'pen' | 'highlighter'
  c: string
  s: number
  /** Pressure per point, when the pencil gave it. */
  p?: number[]
  /** Feel: streamline, smoothing, thinning. */
  f?: [number, number, number]
}

function readStroke(annot: PDFDict, toView: Matrix, id: string): Stroke | null {
  const raw = annot.lookup(INK)
  if (!(raw instanceof PDFString || raw instanceof PDFHexString)) return null
  let data: StoredStroke
  try {
    data = JSON.parse(raw.decodeText())
  } catch {
    return null
  }
  const list = annot.lookup(PDFName.of('InkList'))
  const first = list instanceof PDFArray ? list.lookup(0) : null
  if (!(first instanceof PDFArray)) return null
  const points: number[] = []
  for (let i = 0, k = 0; i + 1 < first.size(); i += 2, k++) {
    const x = (first.lookup(i) as PDFNumber).asNumber()
    const y = (first.lookup(i + 1) as PDFNumber).asNumber()
    const [vx, vy] = apply(toView, x, y)
    points.push(r2(vx), r2(vy), data.p?.[k] ?? 0.5)
  }
  if (!points.length) return null
  return {
    id,
    tool: data.t === 'highlighter' ? 'highlighter' : 'pen',
    color: /^#[0-9a-f]{6}$/i.test(data.c) ? data.c : '#000000',
    size: Number(data.s) || 2,
    pressure: !!data.p,
    points,
    ...(Array.isArray(data.f) && data.f.length === 3 ? { feel: { streamline: data.f[0], smoothing: data.f[1], thinning: data.f[2] } } : {}),
  }
}

export interface ParsedPdf {
  /** The PDF without Onix's strokes (the same bytes if it had none). */
  base: ArrayBuffer
  pages: InkPage[]
}

/**
 * Opens a PDF for writing. PDFs protected against editing (owner password only) are opened
 * too, like any PDF reader does; a PDF that needs a password to be read is refused.
 */
export async function parsePdf(bytes: ArrayBuffer): Promise<ParsedPdf> {
  let doc: PDFDocument
  let changed = false
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (e) {
    if (!(e instanceof EncryptedPDFError)) throw e
    try {
      doc = await PDFDocument.load(bytes, { password: '', updateMetadata: false })
    } catch {
      throw new Error('Este PDF tiene contraseña.')
    }
    // Saved without the protection: our annotations can't be written into an encrypted file.
    // The security dictionary and old cross-reference streams (which point to it) must go too.
    doc.context.trailerInfo.Encrypt = undefined
    for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
      const dict = obj instanceof PDFRawStream ? obj.dict : obj instanceof PDFDict ? obj : null
      if (dict && (dict.lookup(PDFName.of('Type')) === PDFName.of('XRef') || dict.lookup(PDFName.of('Filter')) === PDFName.of('Standard'))) {
        doc.context.delete(ref)
      }
    }
    changed = true
  }

  const pages = doc.getPages().map((page, index): InkPage => {
    const { m, width, height } = pageGeometry(doc, page)
    const toView = m
    const marker = page.node.lookup(PAPER)
    const paperName = marker instanceof PDFName ? (marker.decodeText() as Paper) : null
    const strokes: Stroke[] = []
    const annots = page.node.Annots()
    if (annots) {
      for (let i = annots.size() - 1; i >= 0; i--) {
        const annot = annots.lookup(i)
        if (!(annot instanceof PDFDict) || !annot.has(INK)) continue
        const nm = annot.lookup(PDFName.of('NM'))
        const id = nm instanceof PDFString || nm instanceof PDFHexString ? nm.decodeText() : crypto.randomUUID()
        const stroke = readStroke(annot, toView, id)
        if (stroke) strokes.unshift(stroke)
        annots.remove(i)
        changed = true
      }
    }
    return {
      key: crypto.randomUUID(),
      source: index,
      paper: paperName && PAPERS.includes(paperName) ? paperName : null,
      width: r2(width),
      height: r2(height),
      strokes,
    }
  })

  const base = changed ? (await doc.save({ useObjectStreams: true, updateFieldAppearances: false })).slice().buffer : bytes
  return { base, pages }
}

// ---------- Writing ----------

const hexRgb = (hex: string) => [1, 3, 5].map((i) => Math.round((parseInt(hex.slice(i, i + 2), 16) / 255) * 1000) / 1000)
const n = (v: number) => String(r2(v))

/** Fill path in PDF operators for an outline given in user space. */
function fillPath(pts: number[][]): string {
  const c = smoothClosed(pts)
  if (!c) return ''
  let [px, py] = c.start
  let ops = `${n(px)} ${n(py)} m\n`
  const q = c.quads
  for (let i = 0; i < q.length; i += 4) {
    const [qx, qy, x, y] = [q[i], q[i + 1], q[i + 2], q[i + 3]]
    // PDF has no quadratic curves: the same curve as a cubic one.
    ops += `${n(px + (2 / 3) * (qx - px))} ${n(py + (2 / 3) * (qy - py))} ${n(x + (2 / 3) * (qx - x))} ${n(y + (2 / 3) * (qy - y))} ${n(x)} ${n(y)} c\n`
    px = x
    py = y
  }
  return `${ops}h f\n`
}

function addStroke(doc: PDFDocument, page: PDFPage, annots: PDFArray, stroke: Stroke, toUser: Matrix) {
  const ctx = doc.context
  const shape = outline(stroke).map(([x, y]) => apply(toUser, x, y))
  if (shape.length < 3) return
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of shape) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  const rect = [r2(x0 - 1), r2(y0 - 1), r2(x1 + 1), r2(y1 + 1)]
  const highlight = stroke.tool === 'highlighter'
  const [r, g, b] = hexRgb(stroke.color)

  const appearance = ctx.flateStream(`q\n${highlight ? '/GS0 gs\n' : ''}${r} ${g} ${b} rg\n${fillPath(shape)}Q\n`, {
    Type: 'XObject',
    Subtype: 'Form',
    BBox: rect,
    Resources: highlight ? { ExtGState: { GS0: { Type: 'ExtGState', ca: HIGHLIGHT_OPACITY, CA: HIGHLIGHT_OPACITY, BM: 'Multiply' } } } : {},
  })

  const line: number[] = []
  const pressures: number[] = []
  for (let i = 0; i < stroke.points.length; i += 3) {
    const [x, y] = apply(toUser, stroke.points[i], stroke.points[i + 1])
    line.push(r2(x), r2(y))
    pressures.push(Math.round(stroke.points[i + 2] * 100) / 100)
  }
  const data: StoredStroke = {
    t: stroke.tool,
    c: stroke.color,
    s: stroke.size,
    ...(stroke.pressure ? { p: pressures } : {}),
    ...(stroke.feel ? { f: [stroke.feel.streamline, stroke.feel.smoothing, stroke.feel.thinning] as [number, number, number] } : {}),
  }

  const annot = ctx.obj({
    Type: 'Annot',
    Subtype: 'Ink',
    Rect: rect,
    InkList: [line],
    C: [r, g, b],
    CA: highlight ? HIGHLIGHT_OPACITY : 1,
    BS: { Type: 'Border', W: r2(stroke.size), S: 'S' },
    F: 4,
    P: page.ref,
    NM: PDFString.of(stroke.id),
    M: PDFString.fromDate(new Date()),
    AP: { N: ctx.register(appearance) },
  })
  annot.set(INK, PDFString.of(JSON.stringify(data)))
  annots.push(ctx.register(annot))
}

/** A sheet added in Onix: its paper is drawn into the PDF and the page is marked as Onix paper. */
function drawPaper(doc: PDFDocument, page: PDFPage, paper: Paper, width: number, height: number) {
  page.node.set(PAPER, PDFName.of(paper))
  const { lines, dots } = paperGeometry(paper, width, height)
  if (!lines.length && !dots.length) return
  const [r, g, b] = hexRgb(PAPER_LINE)
  let ops = `q\n${r} ${g} ${b} RG\n`
  // Page coordinates have the origin at the top: flip them.
  if (lines.length) {
    ops += '0.5 w\n'
    for (let i = 0; i < lines.length; i += 4) ops += `${n(lines[i])} ${n(height - lines[i + 1])} m ${n(lines[i + 2])} ${n(height - lines[i + 3])} l\n`
    ops += 'S\n'
  }
  if (dots.length) {
    ops += '1 J 1.3 w\n'
    for (let i = 0; i < dots.length; i += 2) ops += `${n(dots[i])} ${n(height - dots[i + 1])} m ${n(dots[i])} ${n(height - dots[i + 1])} l\n`
    ops += 'S\n'
  }
  page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream(`${ops}Q\n`)))
}

/**
 * The PDF with the current pages and strokes. `base` is the PDF without Onix's strokes; pages
 * removed in Onix are dropped, sheets added in Onix are inserted where they are.
 */
export async function buildPdf(base: ArrayBuffer | null, pages: InkPage[], title?: string): Promise<Uint8Array> {
  const doc = base ? await PDFDocument.load(base, { updateMetadata: false }) : await PDFDocument.create({ updateMetadata: false })
  const count = doc.getPageCount()

  const sources = pages.map((p) => p.source).filter((s): s is number => s !== null)
  if (sources.some((s, i) => s >= count || (i > 0 && s <= sources[i - 1]))) throw new Error('Páginas fuera de orden')
  const kept = new Set(sources)
  for (let i = count - 1; i >= 0; i--) if (!kept.has(i)) doc.removePage(i)
  pages.forEach((p, i) => {
    if (p.source !== null) return
    const page = doc.insertPage(i, [p.width, p.height])
    drawPaper(doc, page, p.paper ?? 'blank', p.width, p.height)
  })

  doc.getPages().forEach((page, i) => {
    const strokes = pages[i].strokes
    if (!strokes.length) return
    const toUser = invert(pageGeometry(doc, page).m)
    let annots = page.node.Annots()
    if (!annots) {
      annots = doc.context.obj([])
      page.node.set(PDFName.of('Annots'), annots)
    }
    for (const s of strokes) addStroke(doc, page, annots, s, toUser)
  })

  if (!base) {
    if (title) doc.setTitle(title)
    doc.setCreator('Onix')
    doc.setProducer('Onix')
  }
  return doc.save({ useObjectStreams: true, updateFieldAppearances: false })
}

/** A PDF made of page images (for PDFs that can't be written on as they are). */
export async function imagesToPdf(images: { jpeg: ArrayBuffer; width: number; height: number }[], title: string) {
  const doc = await PDFDocument.create()
  doc.setTitle(title)
  doc.setCreator('Onix')
  for (const img of images) {
    const embedded = await doc.embedJpg(img.jpeg)
    const page = doc.addPage([img.width, img.height])
    page.drawImage(embedded, { x: 0, y: 0, width: img.width, height: img.height })
  }
  return doc.save()
}
