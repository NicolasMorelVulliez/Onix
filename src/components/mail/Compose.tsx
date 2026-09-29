import { Loader2, Send } from 'lucide-react'
import { useState } from 'react'
import { sendMail } from '../../lib/gmail'
import type { GoogleAccount } from '../../lib/types'
import { Dialog } from '../calendar/Dialog'

export interface Draft {
  accountId: string
  threadId?: string
  to: string
  cc?: string
  subject: string
  body: string
  inReplyTo?: string
  references?: string
}

export function Compose({ draft, accounts, onClose }: { draft: Draft; accounts: GoogleAccount[]; onClose: () => void }) {
  const [d, setD] = useState(draft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (changes: Partial<Draft>) => setD((cur) => ({ ...cur, ...changes }))
  const from = accounts.find((a) => a.id === d.accountId)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!from) return
    setBusy(true)
    setError(null)
    try {
      await sendMail(
        from.id,
        { from: `${from.name} <${from.email}>`, to: d.to, cc: d.cc, subject: d.subject, body: d.body, inReplyTo: d.inReplyTo, references: d.references },
        d.threadId,
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const field = 'w-full rounded-md border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent'
  return (
    <Dialog title={d.threadId ? 'Responder' : 'Nuevo mail'} onClose={onClose}>
      <form onSubmit={send} className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="w-12 text-muted">De</span>
          <select value={d.accountId} disabled={!!d.threadId} onChange={(e) => set({ accountId: e.target.value })} className={field}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} &lt;{a.email}&gt;
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="w-12 text-muted">Para</span>
          <input required value={d.to} onChange={(e) => set({ to: e.target.value })} placeholder="nombre@ejemplo.com, otro@ejemplo.com" className={field} />
        </label>
        <label className="flex items-center gap-2">
          <span className="w-12 text-muted">Cc</span>
          <input value={d.cc ?? ''} onChange={(e) => set({ cc: e.target.value })} className={field} />
        </label>
        <label className="flex items-center gap-2">
          <span className="w-12 text-muted">Asunto</span>
          <input value={d.subject} onChange={(e) => set({ subject: e.target.value })} className={field} />
        </label>
        <textarea
          autoFocus
          required
          value={d.body}
          onChange={(e) => set({ body: e.target.value })}
          rows={10}
          className={`${field} resize-y`}
        />
        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end">
          <button disabled={busy} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-accent-fg disabled:opacity-60">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar
          </button>
        </div>
      </form>
    </Dialog>
  )
}
