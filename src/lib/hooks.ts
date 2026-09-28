import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { Page } from './types'
import { bySortKey } from './util'

const alive = (p: Page) => !p.deleted_at && !p.purged

/** All non-deleted pages that live in the sidebar tree (not database rows). */
export function useTreePages() {
  return useLiveQuery(async () => {
    const pages = await db.pages.filter((p) => alive(p) && !p.database_id && !p.is_template).toArray()
    return pages.sort(bySortKey)
  }, [])
}

export function usePage(id: string) {
  return useLiveQuery(() => db.pages.get(id), [id])
}

export function useRows(databaseId: string) {
  return useLiveQuery(
    () =>
      db.pages
        .where('database_id')
        .equals(databaseId)
        .filter((p) => alive(p) && !p.is_template)
        .toArray(),
    [databaseId],
  )
}

export function useViews(databaseId: string) {
  return useLiveQuery(async () => {
    const views = await db.views.where('database_id').equals(databaseId).filter((v) => !v.deleted_at).toArray()
    return views.sort(bySortKey)
  }, [databaseId])
}

/** Parent chain from the root to the page (for breadcrumbs). */
export function useBreadcrumbs(page: Page | undefined) {
  return useLiveQuery(async () => {
    const chain: Page[] = []
    let cur = page
    while (cur) {
      const parentId: string | null = cur.parent_id ?? cur.database_id
      if (!parentId) break
      const parent = await db.pages.get(parentId)
      if (!parent) break
      chain.unshift(parent)
      cur = parent
    }
    return chain
  }, [page?.id, page?.parent_id, page?.database_id])
}
