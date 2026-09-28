import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { createReactBlockSpec } from '@blocknote/react'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText } from 'lucide-react'
import { useState } from 'react'
import { db } from '../lib/db'
import { toEmbedUrl } from './embed'

const CALLOUT_EMOJIS = ['💡', '⚠️', '📌', '✅', '❗', '📝', '🔥', 'ℹ️']

export const Callout = createReactBlockSpec(
  {
    type: 'callout',
    propSchema: { emoji: { default: '💡' } },
    content: 'inline',
  },
  {
    render: ({ block, editor, contentRef }) => (
      <div className="callout">
        <button
          type="button"
          contentEditable={false}
          className="callout-emoji"
          title="Cambiar ícono"
          onClick={() => {
            const i = CALLOUT_EMOJIS.indexOf(block.props.emoji)
            editor.updateBlock(block, { props: { emoji: CALLOUT_EMOJIS[(i + 1) % CALLOUT_EMOJIS.length] } })
          }}
        >
          {block.props.emoji}
        </button>
        <div className="callout-text" ref={contentRef} />
      </div>
    ),
  },
)

function PageLinkView({ pageId }: { pageId: string }) {
  const page = useLiveQuery(() => db.pages.get(pageId), [pageId])
  if (page === undefined) return <span className="text-sm text-muted">Cargando…</span>
  if (!page || page.purged) return <span className="text-sm text-muted line-through">Página eliminada</span>
  return (
    <Link
      to="/p/$pageId"
      params={{ pageId }}
      className="flex items-center gap-2 rounded px-1 py-1 font-medium underline decoration-(--border) underline-offset-4 hover:bg-hover"
    >
      <span className="text-lg leading-none">{page.icon ?? <FileText className="size-4 text-muted" />}</span>
      <span>{page.title || 'Sin título'}</span>
      {page.deleted_at && <span className="text-xs text-muted">(en la papelera)</span>}
    </Link>
  )
}

export const PageLink = createReactBlockSpec(
  {
    type: 'pageLink',
    propSchema: { pageId: { default: '' } },
    content: 'none',
  },
  {
    render: ({ block }) => (
      <div contentEditable={false} className="w-full">
        <PageLinkView pageId={block.props.pageId} />
      </div>
    ),
  },
)

function EmbedView({ url, onSet }: { url: string; onSet: (url: string) => void }) {
  const [draft, setDraft] = useState('')
  if (!url) {
    return (
      <form
        className="flex w-full gap-2 rounded-md border border-(--border) bg-hover p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) onSet(draft.trim())
        }}
      >
        <input
          autoFocus
          className="flex-1 rounded border border-(--border) bg-(--bg) px-2 py-1 text-sm outline-none"
          placeholder="Pegá un link de Figma, Google Drive, YouTube, Loom, PDF…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="rounded bg-(--fg) px-3 text-sm text-(--bg)">Insertar</button>
      </form>
    )
  }
  const embed = toEmbedUrl(url)
  return (
    <div className="w-full">
      <iframe
        src={embed.src}
        title={url}
        className="w-full rounded-md border border-(--border)"
        style={{ aspectRatio: embed.ratio }}
        allow="autoplay; fullscreen; clipboard-write; encrypted-media; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
      <a href={url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-muted hover:underline">
        {url}
      </a>
    </div>
  )
}

export const Embed = createReactBlockSpec(
  {
    type: 'embed',
    propSchema: { url: { default: '' } },
    content: 'none',
  },
  {
    render: ({ block, editor }) => (
      <div contentEditable={false} className="w-full">
        <EmbedView url={block.props.url} onSet={(url) => editor.updateBlock(block, { props: { url } })} />
      </div>
    ),
  },
)

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    callout: Callout(),
    pageLink: PageLink(),
    embed: Embed(),
  },
})

export type AppEditor = typeof schema.BlockNoteEditor
