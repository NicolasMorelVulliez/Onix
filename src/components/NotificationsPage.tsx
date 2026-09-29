import { Bell, BellOff, Loader2, Plus, Send, Share, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ALL_DAYS, type Category, type NotifyRule, type NotifySettings } from '../../shared/notify'
import { CATEGORIES } from '../lib/calendar'
import {
  currentSubscription,
  disablePush,
  enablePush,
  isIOS,
  isStandalone,
  pushSupported,
  saveNotifySettings,
  sendTestPush,
  useNotifySettings,
} from '../lib/notifications'
import { cx, uid } from '../lib/util'
import { TopBar } from './TopBar'

const DAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const LEADS = [0, 5, 10, 15, 30, 60, 120, 1440]
const leadLabel = (m: number) => (m === 0 ? 'A la hora' : m < 60 ? `${m} min antes` : m === 1440 ? '1 día antes' : `${m / 60} h antes`)

export function NotificationsPage() {
  const settings = useNotifySettings()
  if (!settings) return null
  const save = (s: NotifySettings) => saveNotifySettings(s)
  const setRule = (id: string, changes: Partial<NotifyRule>) =>
    save({ ...settings, rules: settings.rules.map((r) => (r.id === id ? { ...r, ...changes } : r)) })

  return (
    <>
      <TopBar>
        <span className="text-sm">Notificaciones</span>
      </TopBar>
      <div className="mx-auto max-w-3xl px-12 pb-24 pt-12 max-md:px-4 max-md:pt-6">
        <h1 className="page-title mb-2 text-3xl font-bold">Notificaciones</h1>
        <p className="mb-6 text-sm text-muted">
          Avisos en este dispositivo para tus eventos y tareas, en los horarios que elijas. El servidor revisa cada ~5 minutos y
          manda los avisos hasta 3 minutos antes para que nunca lleguen tarde.
        </p>

        <DeviceSection />

        <section className="mb-8">
          <h2 className="mb-2 font-semibold">Resumen del día</h2>
          <div className="rounded-lg border border-line p-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.digest.enabled}
                onChange={(e) => save({ ...settings, digest: { ...settings.digest, enabled: e.target.checked } })}
              />
              <span className="flex-1">Mandarme la agenda del día a las</span>
              <input
                type="time"
                value={settings.digest.time}
                onChange={(e) => save({ ...settings, digest: { ...settings.digest, time: e.target.value } })}
                className="rounded border border-line bg-bg px-1 py-0.5"
              />
            </label>
            <Days value={settings.digest.days} onChange={(days) => save({ ...settings, digest: { ...settings.digest, days } })} />
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center">
            <h2 className="flex-1 font-semibold">Recordatorios</h2>
            <button
              type="button"
              onClick={() =>
                save({
                  ...settings,
                  rules: [
                    ...settings.rules,
                    { id: uid(), enabled: true, type: 'event', categories: [], minutesBefore: 30, allDayAt: '09:00', daysBefore: 0, from: '08:00', to: '22:00', days: ALL_DAYS },
                  ],
                })
              }
              className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-sm hover:bg-hover"
            >
              <Plus size={14} /> Agregar regla
            </button>
          </div>
          <p className="mb-3 text-xs text-muted">
            Podés tener varias reglas: por ejemplo, UADE 1 h antes solo de lunes a viernes, y EGS 10 min antes entre 8 y 19.
          </p>
          <div className="space-y-3">
            {settings.rules.map((r) => (
              <RuleCard
                key={r.id}
                rule={r}
                onChange={(c) => setRule(r.id, c)}
                onDelete={() => save({ ...settings, rules: settings.rules.filter((x) => x.id !== r.id) })}
              />
            ))}
            {settings.rules.length === 0 && <p className="text-sm text-muted">Sin reglas: solo vas a recibir el resumen del día.</p>}
          </div>
        </section>
      </div>
    </>
  )
}

function DeviceSection() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    currentSubscription().then((s) => setSubscribed(!!s))
  }, [])

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    setMessage(null)
    try {
      await fn()
      setSubscribed(!!(await currentSubscription()))
      if (ok) setMessage(ok)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  let body: React.ReactNode
  if (isIOS() && !isStandalone()) {
    body = (
      <p className="flex items-start gap-2">
        <Share size={16} className="mt-0.5 flex-none text-accent" />
        En el iPhone las notificaciones funcionan con Onix instalada: en Safari tocá Compartir → Agregar a inicio, y abrila desde el ícono.
      </p>
    )
  } else if (!pushSupported()) {
    body = <p className="text-muted">Este navegador no admite notificaciones push.</p>
  } else if (subscribed) {
    body = (
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex flex-1 items-center gap-2">
          <Bell size={16} className="text-accent" /> Activadas en este dispositivo
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(async () => setMessage(`Enviada a ${await sendTestPush()} dispositivo(s)`))}
          className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 hover:bg-hover"
        >
          <Send size={14} /> Probar
        </button>
        <button type="button" disabled={busy} onClick={() => run(disablePush)} className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 hover:bg-hover">
          <BellOff size={14} /> Desactivar
        </button>
      </div>
    )
  } else {
    body = (
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-muted">Las notificaciones están apagadas en este dispositivo.</span>
        <button
          type="button"
          disabled={busy || subscribed === null}
          onClick={() => run(enablePush, 'Listo. Tocá "Probar" para verificar.')}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-accent-fg disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />} Activar notificaciones
        </button>
      </div>
    )
  }

  return (
    <section className="mb-8">
      <h2 className="mb-2 font-semibold">Este dispositivo</h2>
      <div className="rounded-lg border border-line p-3 text-sm">
        {body}
        {message && <p className="mt-2 text-xs text-muted">{message}</p>}
      </div>
    </section>
  )
}

function Days({ value, onChange }: { value: number[]; onChange: (d: number[]) => void }) {
  // Monday first, like the calendar.
  const order = [1, 2, 3, 4, 5, 6, 0]
  return (
    <div className="mt-2 flex gap-1">
      {order.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort())}
          className={cx('size-7 rounded-full text-xs font-medium', value.includes(d) ? 'bg-accent text-accent-fg' : 'bg-hover text-muted')}
        >
          {DAY_LABELS[d]}
        </button>
      ))}
    </div>
  )
}

function RuleCard({ rule, onChange, onDelete }: { rule: NotifyRule; onChange: (c: Partial<NotifyRule>) => void; onDelete: () => void }) {
  const toggleCat = (c: Category) =>
    onChange({ categories: rule.categories.includes(c) ? rule.categories.filter((x) => x !== c) : [...rule.categories, c] })
  const sel = 'rounded border border-line bg-bg px-1 py-0.5'
  return (
    <div className={cx('space-y-2 rounded-lg border border-line p-3 text-sm', !rule.enabled && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-2">
        <input type="checkbox" checked={rule.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} title="Activa" />
        <select value={rule.type} onChange={(e) => onChange({ type: e.target.value as NotifyRule['type'] })} className={sel}>
          <option value="event">Eventos del calendario</option>
          <option value="task">Tareas con fecha</option>
        </select>
        <select value={rule.minutesBefore} onChange={(e) => onChange({ minutesBefore: Number(e.target.value) })} className={sel}>
          {LEADS.map((m) => (
            <option key={m} value={m}>
              {leadLabel(m)}
            </option>
          ))}
        </select>
        <button type="button" title="Eliminar regla" onClick={onDelete} className="ml-auto rounded p-1 text-muted hover:bg-hover">
          <Trash2 size={14} />
        </button>
      </div>

      {rule.type === 'event' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">De:</span>
          <button
            type="button"
            onClick={() => onChange({ categories: [] })}
            className={cx('rounded-full px-2 py-0.5 text-xs', rule.categories.length === 0 ? 'bg-accent text-accent-fg' : 'bg-hover text-muted')}
          >
            Todos
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCat(c.id)}
              className={cx('flex items-center gap-1 rounded-full px-2 py-0.5 text-xs', rule.categories.includes(c.id) ? 'bg-accent text-accent-fg' : 'bg-hover text-muted')}
            >
              <span className="size-2 rounded-full" style={{ background: c.color }} /> {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        Si es de todo el día, avisar
        <select value={rule.daysBefore} onChange={(e) => onChange({ daysBefore: Number(e.target.value) })} className={sel}>
          <option value={0}>el mismo día</option>
          <option value={1}>el día anterior</option>
          <option value={2}>2 días antes</option>
        </select>
        a las
        <input type="time" value={rule.allDayAt} onChange={(e) => onChange({ allDayAt: e.target.value })} className={sel} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        Solo entre
        <input type="time" value={rule.from} onChange={(e) => onChange({ from: e.target.value })} className={sel} />y
        <input type="time" value={rule.to} onChange={(e) => onChange({ to: e.target.value })} className={sel} />
      </div>
      <Days value={rule.days} onChange={(days) => onChange({ days })} />
    </div>
  )
}
