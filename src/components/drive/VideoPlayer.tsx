import { ExternalLink, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { streamToken, type DriveFile } from '../../lib/google'
import { Dialog } from '../calendar/Dialog'

/**
 * Plays a Drive video inside Onix. The service worker streams it with the account's token;
 * without a service worker (e.g. development) it falls back to Drive's own player.
 */
export function VideoPlayer({ file, accountId, email, onClose }: { file: DriveFile; accountId: string; email?: string; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const native = !!navigator.serviceWorker?.controller

  useEffect(() => {
    if (!native) return
    let stop = false
    const send = async () => {
      const token = await streamToken(accountId)
      navigator.serviceWorker.controller?.postMessage({ type: 'drive-token', fileId: file.id, token })
      if (!stop) setSrc((s) => s ?? `/drive-stream/${file.id}?t=${encodeURIComponent(token)}`)
    }
    send().catch((e) => setError(e instanceof Error ? e.message : String(e)))
    // Tokens last 1 h; long recordings keep playing with a fresh one.
    const t = setInterval(() => send().catch(() => {}), 40 * 60_000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [accountId, file.id, native])

  return (
    <Dialog title={file.name} onClose={onClose}>
      {native ? (
        src ? (
          <video src={src} controls playsInline autoPlay className="aspect-video w-full rounded-md bg-black" onError={() => setError('No se pudo reproducir este video acá.')} />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-md bg-black/80">
            <Loader2 className="animate-spin text-white" />
          </div>
        )
      ) : (
        <iframe
          src={`https://drive.google.com/file/d/${file.id}/preview${email ? `?authuser=${encodeURIComponent(email)}` : ''}`}
          title={file.name}
          allow="autoplay; fullscreen"
          className="aspect-video w-full rounded-md bg-black"
        />
      )}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <a href={file.webViewLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-muted hover:underline">
        <ExternalLink size={13} /> Abrir en Drive
      </a>
    </Dialog>
  )
}
