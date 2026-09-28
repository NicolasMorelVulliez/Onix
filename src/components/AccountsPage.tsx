import { useLiveQuery } from 'dexie-react-hooks'
import { AlertCircle, ChevronRight, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { addSource, CATEGORIES, refreshSource, removeSource, setGoogleCalendar, updateSource, useCalendarStatus } from '../lib/calendar'
import { db } from '../lib/db'
import { auth } from '../lib/firebase'
import { finishLinkGoogle, listCalendars, setAccountCategory, startLinkGoogle, unlinkGoogle, type GoogleCalendar } from '../lib/google'
import type { CalendarCategory, CalendarSource, GoogleAccount } from '../lib/types'
import { cx } from '../lib/util'
import { TopBar } from './TopBar'

const OUTLOOK_STEPS = [
  'Entrá a outlook.office.com con tu cuenta de UADE.',
  'Configuración (⚙️) → Calendario → Calendarios compartidos → "Publicar un calendario".',
  'Elegí el calendario, permisos "Puede ver todos los detalles", tocá Publicar y copiá el link ICS.',
]

function CategorySelect({ value, onChange, className }: { value: CalendarCategory; onChange: (c: CalendarCategory) => void; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as CalendarCategory)} className={cx('rounded border border-line bg-bg px-1 py-0.5 text-xs', className)}>
      {CATEGORIES.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  )
}

export function AccountsPage() {
  const accounts = useLiveQuery(() => db.google_accounts.filter((a) => !a.deleted_at).toArray(), [])
  const [message, setMessage] = useState<string | null>(null)
  const [justLinked, setJustLinked] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)

  // Coming back from Google's consent screen.
  useEffect(() => {
    if (!window.location.hash) return
    const hash = window.location.hash
    history.replaceState(null, '', window.location.pathname)
    finishLinkGoogle(hash).then((r) => {
      if (!r) return
      if ('error' in r) setMessage(`No se pudo vincular: ${r.error}`)
      else {
        setMessage(`Cuenta ${r.email} vinculada. Elegí qué calendarios mostrar.`)
        setJustLinked(r.id)
      }
    })
  }, [])

  const link = async () => {
    setLinking(true)
    try {
      await startLinkGoogle()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
      setLinking(false)
    }
  }

  return (
    <>
      <TopBar>
        <span className="text-sm">Cuentas</span>
      </TopBar>
      <div className="mx-auto max-w-3xl px-12 pb-24 pt-12 max-md:px-4 max-md:pt-6">
        <h1 className="mb-2 text-3xl font-bold">Cuentas</h1>
        <p className="mb-6 text-sm text-muted">
          Vinculá todas las cuentas de Google que quieras (EGS, personal…) para ver sus calendarios y explorar su Drive.
        </p>
        {message && <p className="mb-4 rounded-md bg-hover px-3 py-2 text-sm">{message}</p>}

        <section className="mb-10">
          <div className="mb-2 flex items-center">
            <h2 className="flex-1 font-semibold">Cuentas de Google</h2>
            <button
              type="button"
              disabled={!auth || linking}
              onClick={link}
              className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-sm font-medium text-white disabled:opacity-50"
            >
              {linking ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Vincular cuenta
            </button>
          </div>
          {!auth && <p className="text-sm text-muted">Configurá Firebase (ver README) para vincular cuentas de Google.</p>}
          {accounts?.length === 0 && auth && <p className="text-sm text-muted">Todavía no vinculaste cuentas de Google.</p>}
          <div className="space-y-2">
            {accounts?.map((a) => (
              <AccountCard key={a.id} account={a} defaultOpen={a.id === justLinked} onRelink={link} />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Al vincular, Google puede mostrar "Google no verificó esta app": es tu propia app. Tocá Configuración avanzada → Ir a Espacio.
            Si en EGS aparece bloqueado, el administrador de Google Workspace tiene que permitir la app.
          </p>
        </section>

        <IcsSection />
      </div>
    </>
  )
}

function AccountCard({ account, defaultOpen, onRelink }: { account: GoogleAccount; defaultOpen: boolean; onRelink: () => void }) {
  const [open, setOpen] = useState(defaultOpen)
  const [calendars, setCalendars] = useState<GoogleCalendar[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sources = useLiveQuery(
    () => db.calendar_sources.filter((s) => s.account_id === account.id && !s.deleted_at).toArray(),
    [account.id],
  )

  useEffect(() => {
    if (!open || calendars) return
    listCalendars(account.id)
      .then(async (cals) => {
        setCalendars(cals)
        // First time: show the primary calendar right away.
        const primary = cals.find((c) => c.primary)
        const hasAny = await db.calendar_sources.filter((s) => s.account_id === account.id && !s.deleted_at).count()
        if (defaultOpen && primary && !hasAny) setGoogleCalendar(account, primary, true)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [open, calendars, account, defaultOpen])

  const enabled = (cal: GoogleCalendar) => !!sources?.find((s) => s.calendar_id === cal.id)?.enabled

  return (
    <div className="rounded-md border border-line text-sm">
      <div className="flex items-center gap-2 p-2">
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight size={14} className={cx('flex-none text-muted transition-transform', open && 'rotate-90')} />
          {account.picture ? (
            <img src={account.picture} alt="" referrerPolicy="no-referrer" className="size-6 flex-none rounded-full" />
          ) : (
            <span className="flex size-6 flex-none items-center justify-center rounded-full bg-hover">{account.email[0]}</span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium">{account.name}</span>
            <span className="block truncate text-xs text-muted">{account.email}</span>
          </span>
        </button>
        {account.needs_reauth ? (
          <button type="button" onClick={onRelink} className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-600 dark:text-red-400">
            Volver a vincular
          </button>
        ) : null}
        <CategorySelect value={account.category} onChange={(c) => setAccountCategory(account.id, c)} />
        <button
          type="button"
          title="Desvincular"
          onClick={() => confirm(`¿Desvincular ${account.email}? Se quitan sus calendarios de la app.`) && unlinkGoogle(account.id)}
          className="rounded p-1 text-muted hover:bg-hover"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {open && (
        <div className="border-t border-line px-3 py-2">
          <div className="mb-1 text-xs font-medium text-muted">Calendarios para mostrar</div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          {!calendars && !error && <Loader2 size={14} className="animate-spin text-muted" />}
          {calendars?.map((cal) => {
            const source = sources?.find((s) => s.calendar_id === cal.id)
            return (
              <div key={cal.id} className="flex items-center gap-2 py-1">
                <input type="checkbox" checked={enabled(cal)} onChange={(e) => setGoogleCalendar(account, cal, e.target.checked)} />
                <span className="size-2.5 flex-none rounded-full" style={{ background: source?.color ?? cal.backgroundColor }} />
                <span className="min-w-0 flex-1 truncate">{cal.summary}</span>
                {source?.enabled ? (
                  <CategorySelect value={source.category} onChange={(category) => updateSource(source.id, { category })} />
                ) : null}
              </div>
            )
          })}
          <p className="mt-1 text-xs text-muted">La categoría nueva de la cuenta se aplica a los calendarios que actives después.</p>
        </div>
      )}
    </div>
  )
}

function IcsSection() {
  const sources = useLiveQuery(() => db.calendar_sources.filter((s) => !s.deleted_at && s.provider !== 'google').toArray(), [])
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState<CalendarCategory>('uade')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setBusy(true)
    await addSource({ name: name.trim() || CATEGORIES.find((c) => c.id === category)!.label, url, category })
    setBusy(false)
    setName('')
    setUrl('')
  }

  return (
    <section>
      <h2 className="mb-1 font-semibold">Links iCal (Outlook / UADE)</h2>
      <p className="mb-3 text-sm text-muted">Para calendarios que no son de Google. Son de solo lectura y se actualizan cada 15 minutos.</p>
      <div className="mb-3 space-y-2">
        {sources?.map((s) => (
          <IcsRow key={s.id} source={s} />
        ))}
      </div>
      <form onSubmit={submit} className="space-y-2 rounded-md border border-line p-3 text-sm">
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          {OUTLOOK_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <input
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Pegá el link .ics (https://… o webcal://…)"
          className="w-full rounded-md border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent"
        />
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre (ej. UADE)"
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent"
          />
          <CategorySelect value={category} onChange={setCategory} className="px-2 text-sm" />
        </div>
        <button disabled={busy} className="w-full rounded-md bg-accent py-2 font-medium text-white disabled:opacity-60">
          {busy ? 'Vinculando…' : 'Agregar link'}
        </button>
      </form>
    </section>
  )
}

function IcsRow({ source: s }: { source: CalendarSource }) {
  const st = useCalendarStatus((all) => all[s.id]) ?? {}
  return (
    <div className="rounded-md border border-line p-2 text-sm">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={s.color}
          title="Color"
          onChange={(e) => updateSource(s.id, { color: e.target.value })}
          className="size-5 flex-none cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <input
          defaultValue={s.name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && updateSource(s.id, { name: e.target.value.trim() })}
          className="min-w-0 flex-1 bg-transparent font-medium outline-none"
        />
        <CategorySelect value={s.category} onChange={(category) => updateSource(s.id, { category })} />
        <input
          type="checkbox"
          title="Mostrar en el calendario"
          checked={!!s.enabled}
          onChange={async (e) => {
            await updateSource(s.id, { enabled: e.target.checked ? 1 : 0 })
            if (e.target.checked) refreshSource({ ...s, enabled: 1 })
            else db.events.where('source_id').equals(s.id).delete()
          }}
        />
        <button type="button" title="Actualizar" onClick={() => refreshSource(s)} className="rounded p-1 text-muted hover:bg-hover">
          {st.loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
        <button
          type="button"
          title="Quitar"
          onClick={() => confirm(`¿Quitar "${s.name}"?`) && removeSource(s.id)}
          className="rounded p-1 text-muted hover:bg-hover"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {st.error && (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
          <AlertCircle size={12} /> {st.error}
        </p>
      )}
    </div>
  )
}
