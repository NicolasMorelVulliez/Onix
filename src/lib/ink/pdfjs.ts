import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

let lib: Promise<typeof import('pdfjs-dist')> | null = null

/** pdf.js, loaded only when a PDF is opened (it's big). */
export function pdfjs() {
  lib ??= import('pdfjs-dist').then((m) => {
    m.GlobalWorkerOptions.workerSrc = workerUrl
    return m
  })
  return lib
}

/** Opens a PDF to render its pages. The bytes are copied: pdf.js takes ownership of what it gets. */
export async function openPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const { getDocument } = await pdfjs()
  return getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise
}

/** Canvas pixels per page: iPads refuse bigger canvases and run out of memory with a few of them. */
export const MAX_PIXELS = navigator.maxTouchPoints > 1 ? 6_000_000 : 14_000_000

/** Every page as a JPEG (for PDFs that can't be written on as they are). */
export async function rasterize(bytes: ArrayBuffer, onProgress?: (done: number, total: number) => void) {
  const pdf = await openPdf(bytes)
  const out: { jpeg: ArrayBuffer; width: number; height: number }[] = []
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const size = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(2.5, Math.sqrt(MAX_PIXELS / (size.width * size.height))) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      await page.render({ canvas, viewport }).promise
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.86))
      canvas.width = canvas.height = 0
      page.cleanup()
      if (!blob) throw new Error('No se pudo convertir la página')
      out.push({ jpeg: await blob.arrayBuffer(), width: size.width, height: size.height })
      onProgress?.(i, pdf.numPages)
    }
  } finally {
    await pdf.loadingTask.destroy()
  }
  return out
}
