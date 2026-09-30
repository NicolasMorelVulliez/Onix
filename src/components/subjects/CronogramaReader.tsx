import { FileUp, HardDrive, Loader2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { API_URL, auth } from '../../lib/firebase'
import { downloadDriveFile } from '../../lib/google'
import type { ClassKind, PlannedClass } from '../../lib/subjects'
import { Dialog } from '../calendar/Dialog'
import { DriveBrowser } from '../drive/DriveBrowser'

interface AiSchedule {
  subject: string
  classes: { date: string; from: string; to: string; topic: string; kind: ClassKind; prep: string }[]
  notes: string
}

const MAX_SIDE = 2200

/** Photos get resized so they fit the 4 MB upload limit (and cost less to read). */
async function toPayload(blob: Blob): Promise<{ file: string; mediaType: string }> {
  let data: Blob = blob
  let mediaType = blob.type || 'application/pdf'
  if (mediaType.startsWith('image/')) {
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    data = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.85))
    mediaType = 'image/jpeg'
  }
  const bytes = new Uint8Array(await data.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { file: btoa(bin), mediaType }
}

/** Sends a cronograma to Claude and returns the classes it found, to review before saving. */
export function CronogramaReader({
  name,
  year,
  onResult,
  onClose,
}: {
  name: string
  year?: string
  onResult: (r: { subject: string; classes: PlannedClass[] }) => void
  onClose: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<string | null>(null)
  const [from, setFrom] = useState('19:00')
  const [to, setTo] = useState('22:00')

  const read = async (blob: Blob) => {
    setError(null)
    setBusy('Preparando el archivo…')
    try {
      const payload = await toPayload(blob)
      setBusy('Leyendo el cronograma… (puede tardar unos segundos)')
      const res = await fetch(`${API_URL}/api/ai/cronograma`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${await auth!.currentUser!.getIdToken()}` },
        body: JSON.stringify({ ...payload, subject: name, year }),
      })
      const body = (await res.json().catch(() => ({}))) as AiSchedule & { error?: string }
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
      if (!body.classes.length) throw new Error('No encontré fechas en ese archivo.')
      setNotes(body.notes || null)
      onResult({
        subject: body.subject,
        classes: body.classes.map((c) => ({ date: c.date, from: c.from || from, to: c.to || to, topic: c.topic, kind: c.kind, prep: c.prep || undefined })),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(null)
  }

  if (picking) {
    return (
      <Dialog title="Elegí el cronograma en Drive" onClose={() => setPicking(false)}>
        <DriveBrowser
          onSelect={async (f, accountId) => {
            setPicking(false)
            setBusy('Bajando de Drive…')
            try {
              await read(await downloadDriveFile(accountId, f))
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
              setBusy(null)
            }
          }}
        />
      </Dialog>
    )
  }

  return (
    <Dialog title="Leer el cronograma" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-muted">
          Subí el cronograma de la materia (PDF, foto, o un Doc/Sheet/PDF de tu Drive). La IA arma las fechas con sus temas y te sugiere qué ver
          antes de cada clase. Después revisás todo antes de crear.
        </p>
        {busy ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-line py-8 text-muted">
            <Loader2 size={18} className="animate-spin text-accent" /> {busy}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
            <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-line px-3 py-6 text-center hover:bg-hover">
              <FileUp size={22} className="text-accent" /> PDF o foto
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) read(f)
                  e.target.value = ''
                }}
              />
            </label>
            <button type="button" onClick={() => setPicking(true)} className="flex flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-line px-3 py-6 hover:bg-hover">
              <HardDrive size={22} className="text-accent" /> Desde Drive
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          Si el cronograma no dice el horario, usar
          <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-line bg-bg px-1 py-0.5" />a
          <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-line bg-bg px-1 py-0.5" />
        </div>
        {notes && <p className="rounded-md bg-hover p-2 text-xs">{notes}</p>}
        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        <p className="flex items-center gap-1 text-xs text-muted">
          <Sparkles size={12} /> Usa Claude (IA). El archivo se envía solo para leerlo; no se guarda.
        </p>
      </div>
    </Dialog>
  )
}
