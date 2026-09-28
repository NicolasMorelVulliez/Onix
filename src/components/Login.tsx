import { useState } from 'react'
import { supabase } from '../lib/supabase'

/** Sign-in with an emailed one-time code (works inside the iPhone PWA, unlike magic links). */
export function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    if (step === 'email') {
      const { error } = await supabase!.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
      if (error) setError(error.message)
      else setStep('code')
    } else {
      const { error } = await supabase!.auth.verifyOtp({ email, token: code, type: 'email' })
      if (error) setError(error.message)
    }
    setBusy(false)
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2 text-xl font-semibold">
          <span className="flex size-7 items-center justify-center rounded bg-fg text-sm text-bg">E</span> Espacio
        </div>
        {step === 'email' ? (
          <>
            <label className="mb-1 block text-sm text-muted" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-3 w-full rounded-md border border-line bg-bg px-3 py-2 outline-none focus:border-accent"
            />
          </>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">Te mandamos un código a {email}.</p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder="Código"
              className="mb-3 w-full rounded-md border border-line bg-bg px-3 py-2 tracking-widest outline-none focus:border-accent"
            />
          </>
        )}
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded-md bg-accent py-2 font-medium text-white disabled:opacity-60">
          {step === 'email' ? 'Enviar código' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
