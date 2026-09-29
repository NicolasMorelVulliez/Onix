import { Check, Copy, Loader2, Video } from 'lucide-react'
import { useState } from 'react'
import { refreshAll } from '../../lib/calendar'
import { createMeet } from '../../lib/gmail'
import type { GoogleAccount } from '../../lib/types'
import { Dialog } from './Dialog'

const pad = (n: number) => String(n).padStart(2, '0')
function nextHalfHour() {
  const d = new Date(Date.now() + 30 * 60_000)
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0)
  return d
}

export function MeetDialog({ accounts, onClose }: { accounts: GoogleAccount[]; onClose: () => void }) {
  const start = nextHalfHour()
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [title, setTitle] = useState('Reunión')
  const [date, setDate] = useState(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`)
  const [time, setTime] = useState(`${pad(start.getHours())}:${pad(start.getMinutes())}`)
  const [minutes, setMinutes] = useState(30)
  const [guests, setGuests] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const create = async (now: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const ev = await createMeet(accountId, {
        title: title.trim() || 'Reunión',
        start: now ? new Date() : new Date(`${date}T${time}`),
        minutes,
        guests: guests.split(/[\s,;]+/).filter((g) => g.includes('@')),
      })
      setLink(ev.hangoutLink ?? ev.htmlLink)
      refreshAll(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  const field = 'w-full rounded-md border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent'
  if (link) {
    return (
      <Dialog title="Reunión creada" onClose={onClose}>
        <div className="space-y-3 text-sm">
          <p className="text-muted">Se agregó a tu calendario{guests.trim() && ' y se mandaron las invitaciones'}.</p>
          <div className="flex items-center gap-2 rounded-md bg-hover px-3 py-2">
            <Video size={16} className="text-accent" />
            <span className="min-w-0 flex-1 truncate">{link}</span>
            <button
              type="button"
              title="Copiar link"
              onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}
              className="rounded p-1 text-muted hover:bg-hover"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <a href={link} target="_blank" rel="noreferrer" className="block rounded-md bg-accent py-2 text-center font-medium text-accent-fg">
            Unirse ahora
          </a>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog title="Nueva reunión de Google Meet" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          create(false)
        }}
        className="space-y-2 text-sm"
      >
        {accounts.length > 1 && (
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={field}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
        )}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" className={field} />
        <div className="flex gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={field}>
            {[15, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={guests}
          onChange={(e) => setGuests(e.target.value)}
          rows={2}
          placeholder="Invitados (emails separados por coma)"
          className={field}
        />
        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !accountId}
            onClick={() => create(true)}
            className="flex-1 rounded-md border border-line py-2 hover:bg-hover disabled:opacity-60"
          >
            Reunión instantánea
          </button>
          <button disabled={busy || !accountId} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent py-2 font-medium text-accent-fg disabled:opacity-60">
            {busy && <Loader2 size={14} className="animate-spin" />} Programar
          </button>
        </div>
      </form>
    </Dialog>
  )
}
