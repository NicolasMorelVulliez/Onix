import { Component, useEffect, useState, type ReactNode } from 'react'

const reload = () => window.location.replace('/')

/** Shown while Firebase restores the session; offers a way out if it takes too long. */
export function Splash() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <img src="/icon.svg" alt="" className="size-16 animate-pulse rounded-2xl" />
      {slow && (
        <>
          <p className="max-w-xs text-sm text-muted">Está tardando más de lo normal. Revisá tu conexión y volvé a intentar.</p>
          <button type="button" onClick={reload} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg">
            Recargar
          </button>
        </>
      )}
    </div>
  )
}

/** Instead of a blank screen, show what failed so it can be reported. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <img src="/icon.svg" alt="" className="size-14 rounded-2xl" />
        <h1 className="text-lg font-semibold">Algo salió mal</h1>
        <pre className="max-w-full overflow-auto whitespace-pre-wrap rounded-md bg-hover p-3 text-left text-xs">{error.message}</pre>
        <button type="button" onClick={reload} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg">
          Volver a abrir Onix
        </button>
      </div>
    )
  }
}
