import type { Syncable } from './types'

/**
 * Decides whether a row pulled from the server should overwrite the local copy.
 * Last write wins by client edit time; local unpushed edits that are newer are kept.
 */
export function shouldApplyRemote(local: Syncable | undefined, remote: Syncable) {
  if (!local) return true
  if (!local.dirty) return true
  return remote.updated_at > local.updated_at
}

/**
 * Firestore document for a row. The row travels as JSON because Firestore rejects
 * nested arrays and `undefined`, which editor content (tables, dates) can contain.
 */
export function toRemote<T extends Syncable>(row: T) {
  const { dirty: _, ...rest } = row
  return { updated_at: row.updated_at, data: JSON.stringify(rest) }
}

export function fromRemote<T extends Syncable>(remote: { data: string }): T {
  return { ...(JSON.parse(remote.data) as T), dirty: 0 }
}
