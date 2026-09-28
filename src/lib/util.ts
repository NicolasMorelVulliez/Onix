import { generateKeyBetween } from 'fractional-indexing'

export const uid = () => crypto.randomUUID()
export const now = () => new Date().toISOString()

export function keyAfter(last: string | null | undefined) {
  return generateKeyBetween(last ?? null, null)
}

export function keyBetween(a: string | null | undefined, b: string | null | undefined) {
  return generateKeyBetween(a ?? null, b ?? null)
}

export const bySortKey = <T extends { sort_key: string }>(a: T, b: T) =>
  a.sort_key < b.sort_key ? -1 : a.sort_key > b.sort_key ? 1 : 0

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

/** Debounced function with `flush()` to run a pending call immediately. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  let pending: A | null = null
  const run = () => {
    clearTimeout(t)
    if (pending) {
      const args = pending
      pending = null
      fn(...args)
    }
  }
  const d = (...args: A) => {
    pending = args
    clearTimeout(t)
    t = setTimeout(run, ms)
  }
  d.flush = run
  return d
}
