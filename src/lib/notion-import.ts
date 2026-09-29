/**
 * Imports Notion's "Markdown & CSV" export (a .zip, possibly with more .zip parts inside).
 * Two steps: `readNotionExport` builds a preview tree (fast, nothing is saved), and
 * `commitImport` creates the pages where the user chose. Everything runs in the browser.
 */
import { BlockNoteEditor, type Block } from '@blocknote/core'
import { generateNKeysBetween } from 'fractional-indexing'
import { unzipSync } from 'fflate'
import { schema as editorSchema } from '../blocks/schema'
import { db } from './db'
import { cellValue, inferSchema, notionName, parseCsv } from './notion-parse'
import { schedulePush } from './sync'
import type { Page, Property, View } from './types'
import { bySortKey, now, uid } from './util'

type Files = Map<string, Uint8Array>

export interface PlanNode {
  /** Path of the .md/.csv without extension. */
  key: string
  path: string
  title: string
  kind: 'page' | 'database'
  children: PlanNode[]
  rows: number
  images: number
}

export interface ImportPlan {
  files: Files
  roots: PlanNode[]
  /** Folder path → node key, whether Notion named the folder with or without the id. */
  folderOf: Map<string, string>
  pages: number
  databases: number
  rows: number
  images: number
}

export interface ImportResult {
  firstId: string | null
  pages: number
  databases: number
  rows: number
  images: number
  skipped: string[]
}

const decoder = new TextDecoder()
const MAX_PAGE_BYTES = 850_000 // Firestore documents are limited to 1 MB
const IMAGE = /\.(png|jpe?g|gif|webp)$/i

function readZip(data: Uint8Array, out: Files = new Map()) {
  for (const [path, bytes] of Object.entries(unzipSync(data))) {
    if (path.endsWith('/') || path.includes('__MACOSX')) continue
    if (/\.zip$/i.test(path)) readZip(bytes, out)
    else out.set(path.normalize('NFC'), bytes)
  }
  return out
}

const dirOf = (p: string) => p.split('/').slice(0, -1).join('/')
const stem = (p: string) => p.replace(/(_all)?\.(md|csv)$/i, '')
const join = (...parts: string[]) => parts.filter(Boolean).join('/')
const imageRefs = (text: string) => [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]).filter((r) => !/^https?:/.test(r))

/** Step 1: understand the export and build the tree shown in the preview. */
export async function readNotionExport(file: File): Promise<ImportPlan> {
  const files = readZip(new Uint8Array(await file.arrayBuffer()))
  const md = [...files.keys()].filter((p) => /\.md$/i.test(p))
  const csvByStem = new Map<string, string>()
  for (const p of [...files.keys()].filter((x) => /\.csv$/i.test(x)).sort()) {
    if (!csvByStem.has(stem(p)) || /_all\.csv$/i.test(p)) csvByStem.set(stem(p), p)
  }
  const entries = [...md, ...csvByStem.values()]

  // A page's subpages live in a folder named "Title id/" or, in newer exports, just "Title/".
  const folderOf = new Map<string, string>()
  for (const p of entries) {
    folderOf.set(stem(p), stem(p))
    const plain = join(dirOf(p), notionName(p))
    if (!folderOf.has(plain)) folderOf.set(plain, stem(p))
  }
  const dbKeys = new Set([...csvByStem.keys()])
  const isRow = (p: string) => dbKeys.has(folderOf.get(dirOf(p)) ?? '')

  const nodes = new Map<string, PlanNode>()
  for (const p of entries) {
    const isDb = /\.csv$/i.test(p)
    const text = isDb ? '' : decoder.decode(files.get(p)!)
    nodes.set(stem(p), {
      key: stem(p),
      path: p,
      title: notionName(p),
      kind: isDb ? 'database' : 'page',
      children: [],
      rows: isDb ? Math.max(0, parseCsv(decoder.decode(files.get(p)!)).length - 1) : 0,
      images: imageRefs(text).length,
    })
  }

  const roots: PlanNode[] = []
  for (const p of entries.sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))) {
    if (isRow(p) && /\.md$/i.test(p)) continue // shown as the database's rows
    const node = nodes.get(stem(p))!
    const parentKey = folderOf.get(dirOf(p))
    const parent = parentKey ? nodes.get(parentKey) : undefined
    if (parent && parent !== node) {
      // Row subpages hang from their database in the preview.
      const target = isRow(parent.path) && /\.md$/i.test(parent.path) ? nodes.get(folderOf.get(dirOf(parent.path))!)! : parent
      target.children.push(node)
    } else roots.push(node)
  }

  const all = [...nodes.values()]
  return {
    files,
    roots,
    folderOf,
    pages: all.filter((n) => n.kind === 'page').length - md.filter(isRow).length,
    databases: all.filter((n) => n.kind === 'database').length,
    rows: all.reduce((s, n) => s + n.rows, 0),
    images: all.reduce((s, n) => s + n.images, 0),
  }
}

async function imageDataUrl(bytes: Uint8Array, name: string) {
  const type = /\.png$/i.test(name) ? 'image/png' : /\.gif$/i.test(name) ? 'image/gif' : /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg'
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type }))
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.75)
}

/**
 * Step 2: create the pages. `parentId` null = top level, as if created by hand.
 * `exclude` holds node keys unchecked in the preview (their subtree is skipped).
 */
export async function commitImport(
  plan: ImportPlan,
  opts: { parentId: string | null; exclude: Set<string> },
  onProgress: (done: number, total: number) => void,
): Promise<ImportResult> {
  const { files, folderOf } = plan
  const editor = BlockNoteEditor.create({ schema: editorSchema })
  const t = now()
  const base = () => ({ created_at: t, updated_at: t, deleted_at: null, purged: 0 as const, dirty: 1 as const, is_template: 0 as const })
  const pages: Page[] = []
  const views: View[] = []
  const result: ImportResult = { firstId: null, pages: 0, databases: 0, rows: 0, images: 0, skipped: [] }
  const idOf = new Map<string, string>()
  const LINK_TOKEN = 'ONIXPAGELINK'
  const CALLOUT_TOKEN = 'ONIXCALLOUT'
  const links: string[] = []
  const callouts: { emoji: string; text: string }[] = []
  const md = [...files.keys()].filter((p) => /\.md$/i.test(p))

  const count = (nodes: PlanNode[]): number => nodes.reduce((s, n) => (opts.exclude.has(n.key) ? s : s + 1 + n.rows + count(n.children)), 0)
  const total = count(plan.roots)
  let done = 0
  const tick = () => onProgress(++done, total)

  // Siblings of the destination keep their order; imported items go after them.
  const existing = (await db.pages.filter((p) => p.parent_id === opts.parentId && !p.database_id && !p.deleted_at).toArray()).sort(bySortKey)
  let lastKey = existing.at(-1)?.sort_key ?? null
  const keysFor = new Map<string, string[]>()
  const nextKey = (parentId: string) => {
    const keys = keysFor.get(parentId) ?? generateNKeysBetween(null, null, 500)
    keysFor.set(parentId, keys)
    return keys.shift() ?? generateNKeysBetween(null, null, 1)[0]
  }

  async function blocksFrom(path: string, isRow: boolean): Promise<Block[] | null> {
    let text = decoder.decode(files.get(path)!)
    text = text.replace(/^\s*# .*\n?/, '') // title (Onix shows it separately)
    if (isRow) text = text.replace(/^(\s*\n)*(([^\n:]{1,60}): [^\n]*\n)+/, '') // "Property: value" lines
    text = text.replace(/<aside>\s*([\s\S]*?)\s*<\/aside>/g, (_, inner: string) => {
      const m = inner.trim().match(/^(\p{Extended_Pictographic}️?)?\s*([\s\S]*)$/u)!
      callouts.push({ emoji: m[1] ?? '💡', text: m[2].replace(/\s*\n+\s*/g, ' ') })
      return `\n${CALLOUT_TOKEN}${callouts.length - 1}\n`
    })
    const images: [string, string][] = []
    for (const ref of new Set(imageRefs(text))) {
      const target = join(dirOf(path), decodeURIComponent(ref)).normalize('NFC')
      const bytes = files.get(target)
      if (!bytes) continue
      if (!IMAGE.test(target)) {
        result.skipped.push(target.split('/').pop()!)
        continue
      }
      try {
        images.push([ref, await imageDataUrl(bytes, target)])
        result.images++
      } catch {
        result.skipped.push(target.split('/').pop()!)
      }
    }
    for (const [ref, url] of images) text = text.split(`(${ref})`).join(`(${url})`)
    // Images that couldn't be read (e.g. HEIC) would show as broken: drop them.
    text = text.replace(/!\[[^\]]*\]\((?!data:|https?:)[^)]*\)/g, '')
    text = text.replace(/^\s*\[[^\]]+\]\(((?!https?:|data:)[^)]*\.(md|csv))\)\s*$/gm, (_, ref: string) => {
      links.push(stem(join(dirOf(path), decodeURIComponent(ref)).normalize('NFC')))
      return `\n${LINK_TOKEN}${links.length - 1}\n`
    })
    text = text.replace(/\[([^\]]+)\]\((?!https?:|data:)[^)]*\.(md|csv)\)/g, '$1')
    const blocks = editor.tryParseMarkdownToBlocks(text) as Block[]
    while (JSON.stringify(blocks).length > MAX_PAGE_BYTES) {
      const i = blocks.map((b) => b.type).lastIndexOf('image')
      if (i < 0) break
      blocks.splice(i, 1, { id: uid(), type: 'paragraph', props: {}, content: [{ type: 'text', text: '(Imagen omitida: la página era muy grande)', styles: { italic: true } }], children: [] } as never)
    }
    return blocks.length ? blocks : null
  }

  const newPage = (init: Partial<Page> & Pick<Page, 'title' | 'parent_id'>): Page => ({
    ...base(),
    id: uid(),
    database_id: null,
    sort_key: '',
    icon: null,
    kind: 'page',
    content: null,
    schema: null,
    props: {},
    ...init,
  })

  async function importNode(node: PlanNode, parentId: string | null) {
    if (opts.exclude.has(node.key)) return
    const sort_key = parentId === opts.parentId ? (lastKey = generateNKeysBetween(lastKey, null, 1)[0]) : nextKey(parentId!)

    if (node.kind === 'page') {
      const page = newPage({ title: node.title, parent_id: parentId, sort_key, content: await blocksFrom(node.path, false) })
      idOf.set(node.key, page.id)
      pages.push(page)
      result.pages++
      result.firstId ??= page.id
      tick()
    } else {
      const [header, ...rows] = parseCsv(decoder.decode(files.get(node.path)!))
      const schema: Property[] = header ? inferSchema(header, rows, () => uid()) : []
      const database = newPage({ title: node.title, parent_id: parentId, sort_key, kind: 'database', schema })
      idOf.set(node.key, database.id)
      pages.push(database)
      result.databases++
      result.firstId ??= database.id
      const groupBy = schema.find((p) => p.type === 'status' || p.type === 'select')
      const view = (name: string, type: View['type'], key: string, group: string | null): View =>
        ({ ...base(), id: uid(), database_id: database.id, name, type, sort_key: key, group_by: group, filters: [], sorts: [], hidden: [] }) as View
      views.push(view('Tabla', 'table', 'a0', null))
      if (groupBy) views.push(view('Tablero', 'board', 'a1', groupBy.id))

      // Row pages live in the database's folder; match them by title.
      const rowFiles = md.filter((p) => folderOf.get(dirOf(p)) === node.key)
      const keys = generateNKeysBetween(null, null, Math.max(rows.length, 1))
      for (const [i, r] of rows.entries()) {
        const title = (r[0] ?? '').trim()
        const at = rowFiles.findIndex((p) => notionName(p) === (title || 'Sin título'))
        const rowPath = at >= 0 ? rowFiles.splice(at, 1)[0] : undefined
        const props: Page['props'] = {}
        schema.forEach((prop, j) => {
          const v = cellValue(prop, r[j + 1] ?? '')
          if (v !== null && !(Array.isArray(v) && !v.length)) props[prop.id] = v
        })
        const row = newPage({ title, parent_id: null, database_id: database.id, sort_key: keys[i], props, content: rowPath ? await blocksFrom(rowPath, true) : null })
        if (rowPath) idOf.set(stem(rowPath), row.id)
        pages.push(row)
        result.rows++
        tick()
      }
      tick()
    }
    for (const child of node.children) {
      // Subpages of a database row belong to that row, not to the database.
      const rowParent = folderOf.get(dirOf(child.path))
      await importNode(child, (rowParent && idOf.get(rowParent)) || idOf.get(node.key)!)
    }
  }

  for (const root of plan.roots) await importNode(root, opts.parentId)

  // Page links and callouts were parsed as placeholder paragraphs: turn them into blocks.
  const linkBlock = (pageId: string) => ({ id: uid(), type: 'pageLink', props: { pageId }, children: [] }) as unknown as Block
  for (const page of pages) {
    if (!page.content) continue
    page.content = page.content.flatMap((b) => {
      const text = Array.isArray(b.content) && b.content.length === 1 && 'text' in b.content[0] ? String(b.content[0].text) : ''
      const c = text.match(new RegExp(`^${CALLOUT_TOKEN}(\\d+)$`))
      if (c) {
        const { emoji, text: body } = callouts[Number(c[1])]
        return [{ id: uid(), type: 'callout', props: { emoji }, content: [{ type: 'text', text: body, styles: {} }], children: [] } as unknown as Block]
      }
      const m = text.match(new RegExp(`^${LINK_TOKEN}(\\d+)$`))
      if (!m) return [b]
      const target = idOf.get(links[Number(m[1])])
      return target ? [linkBlock(target)] : []
    })
  }

  await db.transaction('rw', db.pages, db.views, async () => {
    await db.pages.bulkAdd(pages)
    await db.views.bulkAdd(views)
  })
  schedulePush()
  return result
}
