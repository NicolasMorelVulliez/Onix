import type { ParsedPdf } from './pdf'
import type { InkPage } from './types'
import type { InkRequest } from './worker'

let worker: Worker | null = null
let seq = 0
const waiting = new Map<number, { resolve: (v: never) => void; reject: (e: Error) => void }>()

function call<T>(req: InkRequest, transfer: Transferable[] = []): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; result?: never; error?: string }>) => {
      const w = waiting.get(e.data.id)
      waiting.delete(e.data.id)
      if (e.data.error !== undefined) w?.reject(new Error(e.data.error))
      else w?.resolve(e.data.result!)
    }
  }
  const id = ++seq
  return new Promise<T>((resolve, reject) => {
    waiting.set(id, { resolve: resolve as (v: never) => void, reject })
    worker!.postMessage({ id, req }, transfer)
  })
}

/** Splits a PDF into its content and Onix's editable strokes. `bytes` is handed over (detached). */
export const parsePdf = (bytes: ArrayBuffer) => call<ParsedPdf>({ op: 'parse', bytes }, [bytes])

/** The PDF as it should look now (the base stays usable: it's copied, not handed over). */
export const buildPdf = (base: ArrayBuffer | null, pages: InkPage[], title?: string) => call<Uint8Array>({ op: 'build', base, pages, title })

export const imagesToPdf = (images: { jpeg: ArrayBuffer; width: number; height: number }[], title: string) =>
  call<Uint8Array>(
    { op: 'images', images, title },
    images.map((i) => i.jpeg),
  )
