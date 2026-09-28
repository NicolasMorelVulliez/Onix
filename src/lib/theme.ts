import { useEffect, useSyncExternalStore } from 'react'
import { useUI } from './ui-store'

const media = window.matchMedia('(prefers-color-scheme: dark)')

function useSystemDark() {
  return useSyncExternalStore(
    (cb) => {
      media.addEventListener('change', cb)
      return () => media.removeEventListener('change', cb)
    },
    () => media.matches,
  )
}

/** 'light' | 'dark' after applying the user's setting ("system" follows the OS). */
export function useColorScheme(): 'light' | 'dark' {
  const mode = useUI((s) => s.mode)
  const systemDark = useSystemDark()
  return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
}

/** Keeps <html data-theme data-mode> and the browser bar color in sync with the settings. */
export function useApplyTheme() {
  const theme = useUI((s) => s.theme)
  const scheme = useColorScheme()
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.mode = scheme
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg))
  }, [theme, scheme])
}
