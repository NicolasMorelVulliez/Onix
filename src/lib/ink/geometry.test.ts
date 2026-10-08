import { describe, expect, it } from 'vitest'
import { A4, inLasso, moveStroke, outline, paperGeometry, strokePath, thinPoints, touches } from './geometry'
import type { Stroke } from './types'

const line = (x0: number, y0: number, x1: number, y1: number, steps = 20): Stroke => {
  const points: number[] = []
  for (let i = 0; i <= steps; i++) points.push(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, 0.5)
  return { id: 'l', tool: 'pen', color: '#000000', size: 2, pressure: true, points }
}

describe('strokes', () => {
  it('has a filled outline and path, also for a single tap', () => {
    expect(outline(line(0, 0, 50, 0)).length).toBeGreaterThan(10)
    const dot: Stroke = { ...line(0, 0, 0, 0), points: [5, 5, 0.5] }
    expect(strokePath(dot)).toMatch(/^M.*Z$/)
  })

  it('drops samples that are too close, keeping the last one', () => {
    const dense = line(0, 0, 10, 0, 400)
    const thin = thinPoints(dense.points)
    expect(thin.length).toBeLessThan(dense.points.length / 2)
    expect(thin.slice(-3, -1)).toEqual([10, 0])
  })

  it('finds strokes under the eraser and inside the lasso', () => {
    const s = line(0, 0, 100, 0)
    expect(touches(s, 50, 3, 2)).toBe(true)
    expect(touches(s, 50, 20, 2)).toBe(false)
    const square = [-10, -10, 110, -10, 110, 10, -10, 10]
    expect(inLasso(s, square)).toBe(true)
    expect(inLasso(moveStroke(s, 0, 50), square)).toBe(false)
  })
})

describe('paper', () => {
  it('draws lines, grid and dots inside the page', () => {
    const [w, h] = A4
    const ruled = paperGeometry('ruled', w, h)
    expect(ruled.lines.length / 4).toBeGreaterThan(20)
    expect(paperGeometry('dots', w, h).dots.every((v, i) => (i % 2 ? v < h : v < w))).toBe(true)
    expect(paperGeometry('blank', w, h)).toEqual({ lines: [], dots: [] })
  })
})
