import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArrowLeft, ExternalLink, Loader2, Paperclip, PenSquare, RefreshCw, Reply, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CATEGORIES } from '../../lib/calendar'
import { db } from '../../lib/db'
import { archive, getThread, listThreads, markRead, type GmailMessage, type ThreadSummary } from '../../lib/gmail'
import { hasGmail, startLinkGoogle } from '../../lib/google'
import { attachments, extractBody, header, mailDate, senderName } from '../../lib/mail'
import type { GoogleAccount } from '../../lib/types'
import { cx } from '../../lib/util'
import { TopBar } from '../TopBar'
import { Compose, type Draft } from './Compose'

const colorOf = (a?: GoogleAccount) => CATEGORIES.find((c) => c.id === a?.category)?.color ?? '#787774'

export function MailView() {
  const accounts = useLiveQuery(() => db.google_accounts.filter((a) => !a.deleted_at).toArray(), [])
  const withMail = useMemo(() => accounts?.filter(hasGmail) ?? [], [accounts])
  const withoutMail = accounts?.filter((a) => !hasGmail(a)) ?? []
  const [filter, setFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [open, setOpen] = useState<ThreadSummary | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  const ids = withMail.map((a) => a.id).join(',')
  const load = useCallback(async () => {
    const targets = withMail.filter((a) => filter === 'all' || a.id === filter)
    setThreads(null)
    setErrors([])
    const results = await Promise.allSettled(targets.map((a) => listThreads(a.id, search ? search : 'in:inbox')))
    const ok = results.flatMap((r) => (r.status === 'fulfilled' ? r.value.threads : []))
    setErrors(
      results.flatMap((r, i) => (r.status === 'rejected' ? [`${targets[i].email}: ${(r.reason as Error).message}`] : [])),
    )
    setThreads(ok.sort((a, b) => b.date - a.date))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, filter, search])

  useEffect(() => {
    if (withMail.length) load()
  }, [load, withMail.length])

  const byId = new Map(accounts?.map((a) => [a.id, a]))

  return (
    <>
      <TopBar>
        <span className="text-sm">Correo</span>
      </TopBar>
      <div className="px-8 pb-10 pt-4 max-md:px-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h1 className="page-title mr-2 text-3xl font-bold max-md:w-full max-md:text-2xl">Correo</h1>
          {withMail.length > 1 && (
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-md border border-line bg-bg px-2 py-1 text-sm">
              <option value="all">Todas las cuentas</option>
              {withMail.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setOpen(null)
              setSearch(query.trim())
            }}
            className="flex min-w-48 flex-1 items-center gap-2 rounded-md border border-line px-2"
          >
            <Search size={15} className="text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar (como en Gmail: from:, has:attachment…)"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none"
            />
          </form>
          <button type="button" title="Actualizar" onClick={load} className="rounded p-1.5 text-muted hover:bg-hover">
            <RefreshCw size={16} className={cx(!threads && withMail.length > 0 && 'animate-spin')} />
          </button>
          <button
            type="button"
            disabled={!withMail.length}
            onClick={() => setDraft({ accountId: filter !== 'all' ? filter : withMail[0].id, to: '', subject: '', body: '' })}
            className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-sm font-medium text-accent-fg disabled:opacity-50"
          >
            <PenSquare size={14} /> Redactar
          </button>
        </div>

        {withoutMail.map((a) => (
          <div key={a.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-hover px-3 py-2 text-sm">
            <span className="flex-1">
              <b>{a.email}</b> todavía no tiene permiso para Gmail.
            </span>
            <button type="button" onClick={() => startLinkGoogle(a.email)} className="rounded-md bg-accent px-2 py-0.5 text-accent-fg">
              Dar permiso
            </button>
          </div>
        ))}
        {accounts?.length === 0 && (
          <p className="text-sm text-muted">
            Vinculá una cuenta de Google en{' '}
            <a href="/accounts" className="text-accent hover:underline">
              Cuentas
            </a>{' '}
            para ver tu correo.
          </p>
        )}
        {errors.map((e) => (
          <p key={e} className="mb-2 text-sm text-red-600 dark:text-red-400">
            {e}
          </p>
        ))}

        <div className="flex gap-4">
          <ul className={cx('min-w-0 flex-1 divide-y divide-(--border) md:max-w-md', open && 'max-md:hidden')}>
            {!threads && withMail.length > 0 && <Loader2 size={16} className="m-4 animate-spin text-muted" />}
            {threads?.length === 0 && <p className="py-8 text-center text-sm text-muted">No hay mails{search && ' para esa búsqueda'}.</p>}
            {threads?.map((t) => (
              <li key={`${t.accountId}:${t.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(t)
                    if (t.unread) {
                      markRead(t.accountId, t.id).catch(() => {})
                      setThreads((ts) => ts?.map((x) => (x === t ? { ...x, unread: false } : x)) ?? null)
                    }
                  }}
                  className={cx('w-full px-2 py-2.5 text-left hover:bg-hover', open?.id === t.id && 'bg-hover')}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span title={byId.get(t.accountId)?.email} className="size-2 flex-none rounded-full" style={{ background: colorOf(byId.get(t.accountId)) }} />
                    <span className={cx('min-w-0 flex-1 truncate', t.unread && 'font-semibold')}>
                      {senderName(t.from)}
                      {t.count > 1 && <span className="ml-1 text-xs text-muted">{t.count}</span>}
                    </span>
                    <span className={cx('flex-none text-xs', t.unread ? 'font-semibold text-accent' : 'text-muted')}>{mailDate(t.date)}</span>
                  </span>
                  <span className={cx('block truncate pl-4 text-sm', t.unread ? 'font-medium' : 'text-muted')}>{t.subject}</span>
                  <span className="block truncate pl-4 text-xs text-muted">{t.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
          {open && (
            <ThreadPane
              key={open.id}
              thread={open}
              account={byId.get(open.accountId)}
              onBack={() => setOpen(null)}
              onArchived={() => {
                setThreads((ts) => ts?.filter((x) => x !== open) ?? null)
                setOpen(null)
              }}
              onReply={setDraft}
            />
          )}
        </div>
      </div>
      {draft && <Compose draft={draft} accounts={withMail} onClose={() => setDraft(null)} />}
    </>
  )
}

function ThreadPane({
  thread,
  account,
  onBack,
  onArchived,
  onReply,
}: {
  thread: ThreadSummary
  account?: GoogleAccount
  onBack: () => void
  onArchived: () => void
  onReply: (d: Draft) => void
}) {
  const [messages, setMessages] = useState<GmailMessage[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getThread(thread.accountId, thread.id)
      .then(setMessages)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [thread])

  const reply = () => {
    const last = messages?.at(-1)
    if (!last) return
    const h = last.payload.headers
    const replyTo = header(h, 'Reply-To') || header(h, 'From')
    const subject = header(messages![0].payload.headers, 'Subject')
    onReply({
      accountId: thread.accountId,
      threadId: thread.id,
      to: replyTo,
      subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
      body: '',
      inReplyTo: header(h, 'Message-ID'),
      references: [header(h, 'References'), header(h, 'Message-ID')].filter(Boolean).join(' '),
    })
  }

  return (
    <article className="min-w-0 flex-[1.4] rounded-lg border border-line p-4 max-md:rounded-none max-md:border-0 max-md:p-0">
      <div className="mb-3 flex items-start gap-2">
        <button type="button" aria-label="Volver" onClick={onBack} className="rounded p-1 text-muted hover:bg-hover md:hidden">
          <ArrowLeft size={18} />
        </button>
        <h2 className="min-w-0 flex-1 text-xl font-semibold">{thread.subject}</h2>
      </div>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <button type="button" onClick={reply} disabled={!messages} className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-accent-fg disabled:opacity-50">
          <Reply size={14} /> Responder
        </button>
        <button
          type="button"
          onClick={() => archive(thread.accountId, thread.id).then(onArchived)}
          className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 hover:bg-hover"
        >
          <Archive size={14} /> Archivar
        </button>
        <a
          href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(account?.email ?? '')}#all/${thread.id}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 hover:bg-hover"
        >
          <ExternalLink size={14} /> Abrir en Gmail
        </a>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!messages && !error && <Loader2 size={16} className="animate-spin text-muted" />}
      <div className="space-y-4">
        {messages?.map((m) => (
          <Message key={m.id} message={m} />
        ))}
      </div>
    </article>
  )
}

function Message({ message: m }: { message: GmailMessage }) {
  const h = m.payload.headers
  const body = extractBody(m.payload)
  const files = attachments(m.payload)
  return (
    <div className="border-t border-line pt-3 first:border-0 first:pt-0">
      <div className="mb-2 flex items-baseline gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium" title={header(h, 'From')}>
          {senderName(header(h, 'From'))}
        </span>
        <span className="flex-none text-xs text-muted">{new Date(Number(m.internalDate)).toLocaleString('es-AR')}</span>
      </div>
      <p className="mb-2 truncate text-xs text-muted">Para: {header(h, 'To')}</p>
      {'html' in body ? <HtmlBody html={body.html} /> : <div className="whitespace-pre-wrap text-sm">{body.text}</div>}
      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((f) => (
            <span key={f.filename} className="flex items-center gap-1 rounded-md bg-hover px-2 py-1 text-xs">
              <Paperclip size={12} /> {f.filename}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** HTML mail in a sandboxed iframe: no scripts run; links open in a new tab. */
function HtmlBody({ html }: { html: string }) {
  const [height, setHeight] = useState(200)
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;font:14px/1.5 -apple-system,system-ui,sans-serif;color:#1d1d1f;background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`
  return (
    <iframe
      title="Mensaje"
      srcDoc={doc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      onLoad={(e) => setHeight((e.currentTarget.contentDocument?.documentElement.scrollHeight ?? 200) + 8)}
      style={{ height }}
      className="w-full rounded-md bg-white"
    />
  )
}
