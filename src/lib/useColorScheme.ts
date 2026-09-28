import { useSyncExternalStore } from 'react'

const query = window.matchMedia('(prefers-color-scheme: dark)')

export function useColorScheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    (cb) => {
      query.addEventListener('change', cb)
      return () => query.removeEventListener('change', cb)
    },
    () => (query.matches ? 'dark' : 'light'),
  )
}
