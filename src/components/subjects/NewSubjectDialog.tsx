import { useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Folder, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CATEGORIES } from '../../lib/calendar'
import { db } from '../../lib/db'
import { hasDriveWrite, startLinkGoogle } from '../../lib/google'
import { createSubject, generateClasses, KINDS, numbered, type ClassKind, type ClassSlot, type PlannedClass } from '../../lib/subjects'
import type { CalendarCategory, DriveLink, Page } from '../../lib/types'
import { cx } from '../../lib/util'
import { Dialog } from '../calendar/Dialog'
import { DriveBrowser } from '../drive/DriveBrowser'
import { CronogramaReader } from './CronogramaReader'

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** Creates a subject inside `parent` (e.g. "2 - CUATRIMESTRE"): classes, calendar and Drive folders. */
export function NewSubjectDialog({ parent, onClose }: { parent: Page; onClose: () => void }) {
  const navigate = useNavigate()
  const accounts = useLiveQuery(() => db.google_accounts.filter((a) => !a.deleted_at).toArray(), [])
  const [name, setName] = useState('')
  const [category, setCategory] = useState<CalendarCategory>('uade')
  const [slots, setSlots] = useState<ClassSlot[]>([{ weekday: 1, from: '19:00', to: '22:00' }])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [classes, setClasses] = useState<PlannedClass[] | null>(null)
  const [driveOn, setDriveOn] = useState(true)
  const [driveParent, setDriveParent] = useState<DriveLink | null>(parent.drive ?? null)
  const [picking, setPicking] = useState(false)
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The year comes from where the subject goes (e.g. "2026 / 2 - CUATRIMESTRE").
  const year = useLiveQuery(async () => {
    let cur: Page | undefined = parent
    while (cur) {
      const m = cur.title.match(/\b(20\d\d)\b/)
      if (m) return m[1]
      cur = cur.parent_id ? await db.pages.get(cur.parent_id) : undefined
    }
    return String(new Date().getFullYear())
  }, [parent.id])
  const account = accounts?.find((a) => a.id === driveParent?.accountId)
  const canWrite = account ? hasDriveWrite(account) : false
  const preview = useMemo(() => (classes ? numbered(classes) : []), [classes])

  const generate = () => {
    if (!start || !end || start > end) return setError('Elegí la fecha de inicio y de fin del cuatrimestre.')
    setError(null)
    setClasses(generateClasses(slots, start, end))
  }

  const create = async () => {
    if (!name.trim() || !classes) return
    setError(null)
    try {
      const subject = await createSubject(
        {
          parentId: parent.id,
          name: name.trim(),
          classes,
          category,
          drive: driveOn && driveParent && canWrite ? { accountId: driveParent.accountId, parentFolderId: driveParent.folderId } : null,
        },
        (d, t, label) => setProgress(`${d} de ${t} · ${label}`),
      )
      onClose()
      navigate({ to: '/p/$pageId', params: { pageId: subject.id } })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setProgress(null)
    }
  }

  const setClass = (i: number, c: Partial<PlannedClass>) => setClasses((cs) => cs!.map((x) => (x === preview[i].ref ? { ...x, ...c } : x)))
  const field = 'rounded-md border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent'

  if (picking) {
    return (
      <Dialog title="Carpeta de Drive del cuatrimestre" onClose={() => setPicking(false)}>
        <p className="mb-3 text-sm text-muted">Entrá a la carpeta donde van las materias (por ejemplo 2026 → 2 - CUATRIMESTRE) y tocá "Vincular".</p>
        <DriveBrowser
          onSelect={() => {}}
          onPickFolder={(f, accountId) => {
            const link = { accountId, folderId: f.id, name: f.name }
            setDriveParent(link)
            // Remember it on the semester page for the next subjects.
            db.pages.update(parent.id, { drive: link })
            setPicking(false)
          }}
        />
      </Dialog>
    )
  }

  return (
    <Dialog title={`Nueva materia en ${parent.title || 'esta página'}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="flex gap-2">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la materia" className={`${field} flex-1 text-base font-medium`} />
          <select value={category} onChange={(e) => setCategory(e.target.value as CalendarCategory)} className={field}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {!classes && (
          <>
            <button
              type="button"
              onClick={() => setReading(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-3 font-medium text-accent"
            >
              <Sparkles size={16} /> Leer el cronograma (PDF, foto o archivo de Drive)
            </button>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="h-px flex-1 bg-(--border)" /> o cargá los horarios <span className="h-px flex-1 bg-(--border)" />
            </div>
            <div className="space-y-2">
              {slots.map((s, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select value={s.weekday} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? { ...x, weekday: Number(e.target.value) } : x)))} className={field}>
                    {WEEKDAYS.map((d) => (
                      <option key={d} value={d}>
                        {DAY_NAMES[d]}
                      </option>
                    ))}
                  </select>
                  <input type="time" value={s.from} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} className={field} />
                  <span className="text-muted">a</span>
                  <input type="time" value={s.to} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} className={field} />
                  {slots.length > 1 && (
                    <button type="button" aria-label="Quitar día" onClick={() => setSlots(slots.filter((_, j) => j !== i))} className="rounded p-1 text-muted hover:bg-hover">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setSlots([...slots, { weekday: 4, from: '19:00', to: '22:00' }])} className="flex items-center gap-1 text-muted hover:text-fg">
                <Plus size={14} /> Otro día
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted">Del</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={field} />
              <span className="text-muted">al</span>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={field} />
            </div>
            <button type="button" onClick={generate} className="w-full rounded-md border border-line py-2 font-medium hover:bg-hover">
              Ver las clases
            </button>
          </>
        )}

        {classes && (
          <div>
            <div className="mb-1 flex items-center">
              <span className="flex-1 font-medium">{preview.length} fechas</span>
              <button type="button" onClick={() => setClasses(null)} className="text-xs text-muted hover:underline">
                Volver a cargar
              </button>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-line p-1">
              {preview.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-hover">
                  <span className="w-28 flex-none truncate text-xs font-medium">{c.title}</span>
                  <select value={c.kind} onChange={(e) => setClass(i, { kind: e.target.value as ClassKind })} className="rounded border border-line bg-bg px-1 py-0.5 text-xs">
                    {KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                  <input value={c.topic} onChange={(e) => setClass(i, { topic: e.target.value })} placeholder="Tema" className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-xs outline-none" />
                  <button type="button" aria-label="Quitar" onClick={() => setClasses((cs) => cs!.filter((x) => x !== c.ref))} className="rounded p-0.5 text-muted hover:bg-hover">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-md border border-line p-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={driveOn} onChange={(e) => setDriveOn(e.target.checked)} />
            Crear las carpetas en Drive (materia → cada clase → Grabaciones)
          </label>
          {driveOn && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <Folder size={13} />
              {driveParent ? <span>Dentro de "{driveParent.name}"</span> : <span>Elegí la carpeta del cuatrimestre</span>}
              <button type="button" onClick={() => setPicking(true)} className="rounded border border-line px-1.5 py-0.5 hover:bg-hover">
                {driveParent ? 'Cambiar' : 'Elegir'}
              </button>
              {driveParent && account && !canWrite && (
                <button type="button" onClick={() => startLinkGoogle(account.email)} className="rounded bg-accent px-1.5 py-0.5 text-accent-fg">
                  Dar permiso para crear carpetas
                </button>
              )}
            </div>
          )}
          <p className="mt-1 text-xs text-muted">Si una carpeta ya existe con ese nombre, la usa en vez de crear otra.</p>
        </div>

        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="button"
          disabled={!name.trim() || !classes || !!progress}
          onClick={create}
          className={cx('flex w-full items-center justify-center gap-2 rounded-md bg-accent py-2 font-medium text-accent-fg disabled:opacity-50')}
        >
          {progress && <Loader2 size={15} className="animate-spin" />}
          {progress ?? 'Crear materia'}
        </button>
      </div>
      {reading && (
        <CronogramaReader
          name={name}
          year={year}
          onClose={() => setReading(false)}
          onResult={(r) => {
            setReading(false)
            if (r.subject && !name) setName(r.subject)
            setClasses(r.classes)
          }}
        />
      )}
    </Dialog>
  )
}
