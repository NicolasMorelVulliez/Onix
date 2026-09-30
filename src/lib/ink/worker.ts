/// <reference lib="webworker" />
/** Reading and writing PDFs off the main thread, so the pencil never stutters while saving. */
import { buildPdf, imagesToPdf, parsePdf } from './pdf'
import type { InkPage } from './types'

export type InkRequest =
  | { op: 'parse'; bytes: ArrayBuffer }
  | { op: 'build'; base: ArrayBuffer | null; pages: InkPage[]; title?: string }
  | { op: 'images'; images: { jpeg: ArrayBuffer; width: number; height: number }[]; title: string }

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (e: MessageEvent<{ id: number; req: InkRequest }>) => {
  const { id, req } = e.data
  try {
    if (req.op === 'parse') {
      const result = await parsePdf(req.bytes)
      self.postMessage({ id, result }, [result.base])
    } else {
      const bytes = req.op === 'build' ? await buildPdf(req.base, req.pages, req.title) : await imagesToPdf(req.images, req.title)
      self.postMessage({ id, result: bytes }, [bytes.buffer])
    }
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
