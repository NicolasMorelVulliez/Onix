/**
 * Imports Notion's "Markdown & CSV" export (a .zip, possibly with more .zip parts inside).
 * Everything runs in the browser: pages keep their hierarchy, databases become Onix databases
 * (types guessed from the CSV) and each row keeps its page content and images.
 */
import { BlockNoteEditor, type Block } from '@blocknote/core'
import { generateNKeysBetween } from 'fractional-indexing'
import { unzipSync } from 'fflate'
import { schema as editorSchema } from '../blocks/schema'
import { db } from './db'
import { cellValue, inferSchema, notionName, parseCsv } from './notion-parse'
import { schedulePush } from './sync'
import type { Page, Property, View } from './types'
import { now, uid } from './util'

type Files = Map<string, Uint8Array>

export interface ImportResult {
  rootId: string
  pages: number
  databases: number
  rows: number
  images: number
  skipped: string[]
}

const decoder = new TextDecoder()
const MAX_PAGE_BYTES = 850_000 // Firestore documents are limited to 1 MB

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

export async function importNotionZip(file: File, onProgress: (done: number, total: number) => void): Promise<ImportResult> {
  const files = readZip(new Uint8Array(await file.arrayBuffer()))
  const editor = BlockNoteEditor.create({ schema: editorSchema })
  const t = now()
  const base = () => ({ created_at: t, updated_at: t, deleted_at: null, purged: 0 as const, dirty: 1 as const, is_template: 0 as const })
  const pages: Page[] = []
  const views: View[] = []
  const result: ImportResult = { rootId: uid(), pages: 0, databases: 0, rows: 0, images: 0, skipped: [] }

  const md = [...files.keys()].filter((p) => /\.md$/i.test(p))
  // Prefer "Name id_all.csv" (every row) over "Name id.csv" (the view's rows).
  const csvByStem = new Map<string, string>()
  for (const p of [...files.keys()].filter((x) => /\.csv$/i.test(x)).sort()) {
    if (!csvByStem.has(stem(p)) || /_all\.csv$/i.test(p)) csvByStem.set(stem(p), p)
  }

  // Which Onix page each Notion file/folder became ("stem" = path without extension).
  const idOf = new Map<string, string>()
  const parentOf = (path: string) => idOf.get(dirOf(path)) ?? result.rootId

  const root: Page = { ...base(), id: result.rootId, parent_id: null, database_id: null, sort_key: 'a0', title: 'Importado de Notion', icon: '📥', kind: 'page', content: null, schema: null, props: {} }
  // Put the import after the existing top-level pages.
  const top = (await db.pages.filter((p) => p.parent_id === null && p.database_id === null).toArray()).map((p) => p.sort_key).sort()
  root.sort_key = generateNKeysBetween(top.at(-1) ?? null, null, 1)[0]
  pages.push(root)

  // Stems of md files that are database rows (created from the CSV, not as plain pages).
  const rowStems = new Set<string>()
  for (const [dbStem] of csvByStem) for (const p of md) if (dirOf(p) === dbStem) rowStems.add(stem(p))

  // Parents before children: shallow paths first.
  const items = [...md.filter((p) => !rowStems.has(stem(p))), ...csvByStem.values()].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
  const total = items.length + rowStems.size
  let done = 0
  const tick = () => onProgress(++done, total)

  // Sibling order follows the file order.
  const keysFor = new Map<string, string[]>()
  const nextKey = (parentId: string) => {
    const keys = keysFor.get(parentId) ?? generateNKeysBetween(null, null, 500)
    keysFor.set(parentId, keys)
    return keys.shift() ?? generateNKeysBetween(null, null, 1)[0]
  }

  const LINK_TOKEN = 'ONIXPAGELINK'
  const CALLOUT_TOKEN = 'ONIXCALLOUT'
  const links: string[] = []
  const callouts: { emoji: string; text: string }[] = []

  async function blocksFrom(path: string, isRow: boolean): Promise<Block[] | null> {
    let text = decoder.decode(files.get(path)!)
    text = text.replace(/^\s*# .*\n?/, '') // title (Onix shows it separately)
    if (isRow) text = text.replace(/^(\s*\n)*(([^\n:]{1,60}): [^\n]*\n)+/, '') // "Property: value" lines
    // Callouts: <aside>💡 text</aside> → a callout block (resolved after parsing, like page links).
    text = text.replace(/<aside>\s*([\s\S]*?)\s*<\/aside>/g, (_, inner: string) => {
      const m = inner.trim().match(/^(\p{Extended_Pictographic}\uFE0F?)?\s*([\s\S]*)$/u)!
      callouts.push({ emoji: m[1] ?? '💡', text: m[2].replace(/\s*\n+\s*/g, ' ') })
      return `\n${CALLOUT_TOKEN}${callouts.length - 1}\n`
    })
    // Images inside the export become inline data: URLs.
    const images: [string, string][] = []
    for (const m of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      const ref = decodeURIComponent(m[1])
      if (/^https?:/.test(ref)) continue
      const target = [dirOf(path), ref].filter(Boolean).join('/').normalize('NFC')
      const bytes = files.get(target)
      if (bytes && /\.(png|jpe?g|gif|webp)$/i.test(target)) {
        try {
          images.push([m[1], await imageDataUrl(bytes, target)])
          result.images++
        } catch {
          result.skipped.push(target)
        }
      }
    }
    for (const [ref, url] of images) text = text.split(`(${ref})`).join(`(${url})`)
    // A line that only links to another exported page/database becomes a page link block
    // (resolved at the end, once every page has its Onix id). Inline links become plain text.
    text = text.replace(/^\s*\[[^\]]+\]\(((?!https?:|data:)[^)]*\.(md|csv))\)\s*$/gm, (_, ref: string) => {
      const target = [dirOf(path), decodeURIComponent(ref)].filter(Boolean).join('/').normalize('NFC')
      links.push(stem(target))
      return `\n${LINK_TOKEN}${links.length - 1}\n`
    })
    text = text.replace(/\[([^\]]+)\]\((?!https?:|data:)[^)]*\.(md|csv)\)/g, '$1')
    const blocks = editor.tryParseMarkdownToBlocks(text) as Block[]
    // Keep pages under Firestore's document limit: drop images from the end if needed.
    while (JSON.stringify(blocks).length > MAX_PAGE_BYTES) {
      const i = blocks.map((b) => b.type).lastIndexOf('image')
      if (i < 0) break
      blocks.splice(i, 1, { id: uid(), type: 'paragraph', props: {}, content: [{ type: 'text', text: '(Imagen omitida: la página era muy grande)', styles: { italic: true } }], children: [] } as never)
    }
    return blocks.length ? blocks : null
  }

  for (const path of items) {
    const parentId = parentOf(path)
    if (/\.md$/i.test(path)) {
      const page: Page = { ...base(), id: uid(), parent_id: parentId, database_id: null, sort_key: nextKey(parentId), title: notionName(path), icon: null, kind: 'page', content: await blocksFrom(path, false), schema: null, props: {} }
      idOf.set(stem(path), page.id)
      pages.push(page)
      result.pages++
      tick()
      continue
    }

    // A database: schema from the CSV header and values, one row page per line.
    const [header, ...rows] = parseCsv(decoder.decode(files.get(path)!))
    if (!header) {
      tick()
      continue
    }
    const dbId = uid()
    const schema: Property[] = inferSchema(header, rows, () => uid())
    const database: Page = { ...base(), id: dbId, parent_id: parentId, database_id: null, sort_key: nextKey(parentId), title: notionName(path), icon: null, kind: 'database', content: null, schema, props: {} }
    idOf.set(stem(path), dbId)
    pages.push(database)
    result.databases++
    const groupBy = schema.find((p) => p.type === 'status' || p.type === 'select')
    views.push({ ...base(), id: uid(), database_id: dbId, name: 'Tabla', type: 'table', sort_key: 'a0', group_by: null, filters: [], sorts: [], hidden: [] } as View)
    if (groupBy) views.push({ ...base(), id: uid(), database_id: dbId, name: 'Tablero', type: 'board', sort_key: 'a1', group_by: groupBy.id, filters: [], sorts: [], hidden: [] } as View)

    // Row pages live in the folder named like the CSV; match them by title.
    const rowFiles = md.filter((p) => dirOf(p) === stem(path))
    const keys = generateNKeysBetween(null, null, Math.max(rows.length, 1))
    for (const [i, r] of rows.entries()) {
      const title = (r[0] ?? '').trim()
      const mdIndex = rowFiles.findIndex((p) => notionName(p) === (title || 'Sin título'))
      const rowPath = mdIndex >= 0 ? rowFiles.splice(mdIndex, 1)[0] : undefined
      const props: Page['props'] = {}
      schema.forEach((prop, j) => {
        const v = cellValue(prop, r[j + 1] ?? '')
        if (v !== null && !(Array.isArray(v) && !v.length)) props[prop.id] = v
      })
      const row: Page = { ...base(), id: uid(), parent_id: null, database_id: dbId, sort_key: keys[i], title, icon: null, kind: 'page', content: rowPath ? await blocksFrom(rowPath, true) : null, schema: null, props }
      if (rowPath) {
        idOf.set(stem(rowPath), row.id)
        tick()
      }
      pages.push(row)
      result.rows++
    }
    tick()
  }

  // Subpages of rows (and anything left inside database folders) hang from their parent.
  for (const path of md.filter((p) => rowStems.has(stem(p)) && !idOf.has(stem(p)))) {
    const parentId = parentOf(path)
    pages.push({ ...base(), id: uid(), parent_id: parentId, database_id: null, sort_key: nextKey(parentId), title: notionName(path), icon: null, kind: 'page', content: await blocksFrom(path, false), schema: null, props: {} })
    result.pages++
    tick()
  }

  // Resolve page links; the import root lists everything it contains.
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
  root.content = pages.filter((p) => p.parent_id === root.id).sort((a, b) => (a.sort_key < b.sort_key ? -1 : 1)).map((p) => linkBlock(p.id))

  await db.transaction('rw', db.pages, db.views, async () => {
    await db.pages.bulkAdd(pages)
    await db.views.bulkAdd(views)
  })
  schedulePush()
  return result
}
