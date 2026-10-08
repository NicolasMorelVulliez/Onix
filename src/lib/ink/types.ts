/** Handwritten notes on PDFs and notebooks (the "cuaderno"). */

export type Paper = 'blank' | 'ruled' | 'grid' | 'dots'
export type Pen = 'pen' | 'highlighter'
export type Tool = Pen | 'eraser' | 'lasso'

/**
 * A stroke in page coordinates: 1 unit = 1 PDF point, origin at the top-left corner of the
 * page as it is shown (rotation already applied).
 */
export interface Stroke {
  id: string
  tool: Pen
  /** #rrggbb */
  color: string
  size: number
  /** The pencil reported pressure; otherwise (mouse, finger) it's simulated from speed. */
  pressure: boolean
  /** x, y, pressure, x, y, pressure… */
  points: number[]
  /** How the pen felt when it was drawn (perfect-freehand); missing = the original defaults. */
  feel?: Feel
}

/** perfect-freehand parameters: lag that steadies the line, corner rounding, pressure effect. */
export interface Feel {
  streamline: number
  smoothing: number
  thinning: number
}

export interface InkPage {
  /** Stable id for this page while editing. */
  key: string
  /** Index of the page in the base PDF; null for a sheet added in Onix and not saved yet. */
  source: number | null
  /** Paper drawn by Onix: new sheets and the ones Onix saved before. null = the PDF's content. */
  paper: Paper | null
  width: number
  height: number
  strokes: Stroke[]
}

/** Layout of a page without its strokes (what the document row stores). */
export type PageSpec = Omit<InkPage, 'strokes'>

/** A document being written on: a PDF from Drive, one imported from the device, or a new notebook. */
export interface InkDoc {
  id: string
  /** Google account whose Drive holds the file; null = only on this device. */
  account_id: string | null
  /** Drive file; null until the first upload. */
  file_id: string | null
  /** Where the file is (or will be created). */
  folder_id: string | null
  /** Drive file this PDF was made from (a Google Slides/Docs or Office file). */
  source_id: string | null
  /** Created by Onix as a notebook (vs. a PDF someone else made). */
  notebook: 0 | 1
  /** The Onix page it was made for (a class), so the class always opens the same notebook. */
  page_id?: string | null
  name: string
  /** The PDF without Onix's ink (null for a notebook that only has Onix sheets). */
  base: ArrayBuffer | null
  pages: PageSpec[]
  /** md5Checksum of the Drive file when it was last downloaded or uploaded. */
  remote: string | null
  dirty: 0 | 1
  /** Bumped on every local change, so an upload knows if something changed meanwhile. */
  rev: number
  updated_at: string
}

/** Strokes of one page, stored apart so writing only saves the page that changed. */
export interface InkStrokes {
  /** `${doc_id}:${page key}` */
  id: string
  doc_id: string
  strokes: Stroke[]
}
