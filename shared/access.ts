/**
 * Who can use Onix. Everything lives in the owner's space (users/{OWNER}); another Google
 * account gets in only if the owner added its email (Cuentas → "Quién puede entrar"), and then
 * it sees that same space. firestore.rules and the /api functions enforce it; the app only
 * shows it. A uid isn't a secret (it can't be used to sign in), so it can live in the code.
 *
 * Keep OWNER in sync with firestore.rules (a test checks it).
 */
export const OWNER = '6uwvd6RHyMhce5F5GOSDRuUMLRj1'

export const normalizeEmail = (email: string) => email.trim().toLowerCase()
