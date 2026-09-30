import { degrees, PDFArray, PDFDocument, PDFName } from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
import { buildPdf, invert, parsePdf, viewTransform } from './pdf'
import type { InkPage, Stroke } from './types'

const stroke = (over: Partial<Stroke> = {}): Stroke => ({
  id: crypto.randomUUID(),
  tool: 'pen',
  color: '#1e5bd8',
  size: 2,
  pressure: true,
  points: [10, 20, 0.4, 30, 25, 0.6, 50, 40, 0.8, 70, 42, 0.5],
  ...over,
})

const sheet = (over: Partial<InkPage> = {}): InkPage => ({
  key: crypto.randomUUID(),
  source: null,
  paper: 'ruled',
  width: 595.28,
  height: 841.89,
  strokes: [],
  ...over,
})

const buffer = (bytes: Uint8Array) => bytes.slice().buffer

async function samplePdf(sizes: [number, number][], rotate = 0) {
  const doc = await PDFDocument.create()
  for (const s of sizes) doc.addPage(s).setRotation(degrees(rotate))
  return buffer(await doc.save())
}

function expectSamePoints(a: number[], b: number[]) {
  expect(a.length).toBe(b.length)
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 1))
}

describe('viewTransform', () => {
  it('matches pdf.js for every rotation and round-trips', () => {
    const box = [0, 0, 600, 800]
    expect(viewTransform(box, 0).m).toEqual([1, 0, 0, -1, 0, 800])
    const turned = viewTransform(box, 90)
    expect([turned.width, turned.height]).toEqual([800, 600])
    for (const r of [0, 90, 180, 270]) {
      const { m } = viewTransform([10, 20, 610, 820], r)
      const inv = invert(m)
      const [x, y] = [m[0] * 100 + m[2] * 200 + m[4], m[1] * 100 + m[3] * 200 + m[5]]
      expect(inv[0] * x + inv[2] * y + inv[4]).toBeCloseTo(100)
      expect(inv[1] * x + inv[3] * y + inv[5]).toBeCloseTo(200)
    }
  })
})

describe('notebooks', () => {
  it('writes sheets and strokes, and reads them back', async () => {
    const a = stroke()
    const b = stroke({ tool: 'highlighter', color: '#ffe14d', size: 14, pressure: false })
    const pdf = await buildPdf(null, [sheet({ strokes: [a, b] }), sheet({ paper: 'dots' })], 'Apuntes')
    const back = await parsePdf(buffer(pdf))

    expect(back.pages.map((p) => [p.source, p.paper])).toEqual([
      [0, 'ruled'],
      [1, 'dots'],
    ])
    const [ra, rb] = back.pages[0].strokes
    expect(ra).toMatchObject({ id: a.id, tool: 'pen', color: a.color, size: 2, pressure: true })
    expectSamePoints(ra.points, a.points)
    expect(rb).toMatchObject({ id: b.id, tool: 'highlighter', pressure: false })
    expect(back.pages[1].strokes).toEqual([])

    // The base keeps the paper but not the strokes.
    const base = await PDFDocument.load(back.base)
    expect(base.getPage(0).node.Annots()?.size() ?? 0).toBe(0)
    expect(base.getPage(0).node.get(PDFName.of('OnixPaper'))).toBeTruthy()
  })

  it('saves strokes as ink annotations other apps can show', async () => {
    const pdf = await buildPdf(null, [sheet({ strokes: [stroke()] })])
    const doc = await PDFDocument.load(pdf)
    const annot = doc.getPage(0).node.Annots()!.lookup(0) as import('@cantoo/pdf-lib').PDFDict
    expect(annot.lookup(PDFName.of('Subtype'))).toBe(PDFName.of('Ink'))
    expect(annot.lookup(PDFName.of('AP'))).toBeTruthy()
    expect(annot.lookup(PDFName.of('InkList'))).toBeInstanceOf(PDFArray)
  })
})

describe('writing on PDFs', () => {
  it('keeps strokes where they were drawn on rotated pages', async () => {
    const base = await samplePdf([[600, 800]], 90)
    const parsed = await parsePdf(base)
    expect([parsed.pages[0].width, parsed.pages[0].height]).toEqual([800, 600])
    const s = stroke()
    const back = await parsePdf(buffer(await buildPdf(parsed.base, [{ ...parsed.pages[0], strokes: [s] }])))
    expectSamePoints(back.pages[0].strokes[0].points, s.points)
  })

  it('drops removed pages and inserts new sheets in place', async () => {
    const base = await samplePdf([
      [100, 100],
      [200, 200],
      [300, 300],
    ])
    const { pages } = await parsePdf(base)
    const spec = [pages[0], sheet({ width: 100, height: 100, strokes: [stroke()] }), pages[2]]
    const back = await parsePdf(buffer(await buildPdf(base, spec)))
    expect(back.pages.map((p) => [p.width, p.paper])).toEqual([
      [100, null],
      [100, 'ruled'],
      [300, null],
    ])
    expect(back.pages[1].strokes).toHaveLength(1)
  })

  it('keeps other annotations and rewrites Onix ones on every save', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([500, 500])
    const note = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [10, 10, 30, 30] }))
    page.node.set(PDFName.of('Annots'), doc.context.obj([note]))
    const parsed = await parsePdf(buffer(await doc.save()))

    const once = await buildPdf(parsed.base, [{ ...parsed.pages[0], strokes: [stroke()] }])
    const again = await parsePdf(buffer(once))
    const twice = await buildPdf(again.base, again.pages)
    const final = await PDFDocument.load(twice)
    expect(final.getPage(0).node.Annots()!.size()).toBe(2) // the note + one stroke, not two
  })

  it('opens PDFs protected against editing', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([400, 400])
    doc.encrypt({ ownerPassword: 'profe', userPassword: '', permissions: { modifying: false } })
    const parsed = await parsePdf(buffer(await doc.save()))
    const out = await buildPdf(parsed.base, [{ ...parsed.pages[0], strokes: [stroke()] }])
    const back = await parsePdf(buffer(out))
    expect(back.pages[0].strokes).toHaveLength(1)
  })
})

describe('protected PDFs saved with cross-reference streams', () => {
  it('opens them and saves them without the protection', async () => {
    for (const useObjectStreams of [true, false]) {
      const doc = await PDFDocument.create()
      doc.addPage([400, 400])
      doc.encrypt({ ownerPassword: 'profe', userPassword: '', permissions: { modifying: false } })
      const parsed = await parsePdf(buffer(await doc.save({ useObjectStreams })))
      const out = await buildPdf(parsed.base, [{ ...parsed.pages[0], strokes: [stroke()] }])
      expect((await parsePdf(buffer(out))).pages[0].strokes).toHaveLength(1)
    }
  })

  it('refuses PDFs that need a password to be read', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([400, 400])
    doc.encrypt({ ownerPassword: 'profe', userPassword: 'secreta' })
    await expect(parsePdf(buffer(await doc.save()))).rejects.toThrow('contraseña')
  })
})
