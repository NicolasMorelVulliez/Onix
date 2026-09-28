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

/** Strips local-only and server-only fields before a row is pushed. */
export function toRemote<T extends Syncable>(row: T, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { dirty, ...rest } = row
  return { ...rest, user_id: userId }
}

/** Strips server-only fields from a pulled row. */
export function fromRemote<T extends Syncable>(row: T & { user_id?: string; server_updated_at?: string }): T {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user_id, server_updated_at, ...rest } = row
  return { ...(rest as unknown as T), dirty: 0 }
}
