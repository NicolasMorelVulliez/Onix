import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_HIGHLIGHTER, DEFAULT_PEN, type PenSettings } from './geometry'
import type { Paper, Pen, Tool } from './types'

export const PEN_COLORS = ['#1f1f1f', '#1e5bd8', '#d93025', '#188038', '#8e24aa']
export const HIGHLIGHT_COLORS = ['#ffd83d', '#7ee081', '#ff8fb1', '#7cc4ff']
export const SIZES: Record<Pen | 'eraser', number[]> = {
  pen: [1, 1.8, 3],
  highlighter: [8, 14, 22],
  eraser: [5, 12, 26],
}
/** Range of the thickness slider, in points. */
export const SIZE_RANGE: Record<Pen, [number, number]> = { pen: [0.3, 8], highlighter: [3, 40] }

export type PenState = { color: string; size: number } & PenSettings

interface InkTools {
  tool: Tool
  pen: PenState
  highlighter: PenState
  /** Ruler on screen: strokes that start next to its edge come out straight. */
  ruler: boolean
  eraser: number
  /** Fingers draw too (without a pencil); otherwise they scroll and zoom. */
  fingerDraws: boolean
  /** Paper for new notebooks and added sheets. */
  paper: Paper
  set: (patch: Partial<Omit<InkTools, 'set'>>) => void
}

/** Pen, colors and sizes, remembered on this device. */
export const useInkTools = create<InkTools>()(
  persist(
    (set) => ({
      tool: 'pen',
      pen: { color: PEN_COLORS[0], size: SIZES.pen[1], ...DEFAULT_PEN },
      highlighter: { color: HIGHLIGHT_COLORS[0], size: SIZES.highlighter[1], ...DEFAULT_HIGHLIGHTER },
      ruler: false,
      eraser: SIZES.eraser[1],
      fingerDraws: false,
      paper: 'ruled',
      set: (patch) => set(patch),
    }),
    {
      name: 'onix-ink',
      partialize: ({ tool, pen, highlighter, eraser, fingerDraws, paper }) => ({ tool, pen, highlighter, eraser, fingerDraws, paper }),
      // Settings saved before the pen sliders existed: fill in the new fields.
      merge: (saved, current) => {
        const s = (saved ?? {}) as Partial<InkTools>
        return { ...current, ...s, pen: { ...current.pen, ...s.pen }, highlighter: { ...current.highlighter, ...s.highlighter } }
      },
    },
  ),
)
