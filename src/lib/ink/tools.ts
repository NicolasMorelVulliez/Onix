import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Paper, Pen, Tool } from './types'

export const PEN_COLORS = ['#1f1f1f', '#1e5bd8', '#d93025', '#188038', '#8e24aa']
export const HIGHLIGHT_COLORS = ['#ffd83d', '#7ee081', '#ff8fb1', '#7cc4ff']
export const SIZES: Record<Pen | 'eraser', number[]> = {
  pen: [1, 1.8, 3],
  highlighter: [8, 14, 22],
  eraser: [5, 12, 26],
}

interface InkTools {
  tool: Tool
  pen: { color: string; size: number }
  highlighter: { color: string; size: number }
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
      pen: { color: PEN_COLORS[0], size: SIZES.pen[1] },
      highlighter: { color: HIGHLIGHT_COLORS[0], size: SIZES.highlighter[1] },
      eraser: SIZES.eraser[1],
      fingerDraws: false,
      paper: 'ruled',
      set: (patch) => set(patch),
    }),
    { name: 'onix-ink', partialize: ({ tool, pen, highlighter, eraser, fingerDraws, paper }) => ({ tool, pen, highlighter, eraser, fingerDraws, paper }) },
  ),
)
