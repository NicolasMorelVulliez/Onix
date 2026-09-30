import { getRedirectResult, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { auth, googleProvider } from '../lib/firebase'

// The installed iPhone app (standalone PWA) can't use popups reliably.
const standalone = window.matchMedia('(display-mode: standalone)').matches

export function Login() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getRedirectResult(auth!).catch((e) => setError(e.message))
  }, [])

  const signIn = async () => {
    setBusy(true)
    setError(null)
    try {
      if (standalone) await signInWithRedirect(auth!, googleProvider)
      else await signInWithPopup(auth!, googleProvider)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2 text-xl font-semibold">
          <img src="/icon.svg" alt="" className="size-9 rounded-[9px] shadow-sm" /> Onix
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={signIn}
          className="w-full rounded-md border border-line py-2 font-medium hover:bg-hover disabled:opacity-60"
        >
          Entrar con Google
        </button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <p className="mt-4 text-xs text-muted">
          Esta es la cuenta de la app. Después, en Cuentas, podés vincular todas las cuentas de Google que quieras para
          Calendar y Drive.
        </p>
      </div>
    </div>
  )
}

/** Signed in with a Google account that isn't one of Onix's. */
export function NoAccess({ email }: { email: string | null }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2 text-xl font-semibold">
          <img src="/icon.svg" alt="" className="size-9 rounded-[9px] shadow-sm" /> Onix
        </div>
        <p className="mb-1 font-medium">Esta cuenta no tiene acceso</p>
        <p className="mb-5 text-sm text-muted">
          {email ?? 'Esta cuenta'} no está habilitada para entrar a Onix. Si es tuya, entrá con tu cuenta principal y agregala en
          Cuentas → Quién puede entrar.
        </p>
        <button type="button" onClick={() => signOut(auth!)} className="w-full rounded-md border border-line py-2 font-medium hover:bg-hover">
          Entrar con otra cuenta
        </button>
      </div>
    </div>
  )
}
