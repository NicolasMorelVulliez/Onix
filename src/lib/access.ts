import type { User } from 'firebase/auth'
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'
import { normalizeEmail, OWNER } from '../../shared/access'
import { firestore } from './firebase'
import { now } from './util'

export { OWNER }

const remembered = (uid: string) => `onix-access:${uid}`

function remember(uid: string, ok: boolean) {
  try {
    if (ok) localStorage.setItem(remembered(uid), '1')
    else localStorage.removeItem(remembered(uid))
  } catch {
    // Private mode: it just asks again next time.
  }
}

/**
 * Whether this account may use Onix: the owner always; any other account only if the owner
 * added its email (Firestore's rules decide: a denied read means no). Without connection it
 * trusts the last answer, so a member's iPad still opens offline.
 */
export async function checkAccess(user: User): Promise<boolean> {
  if (user.uid === OWNER) return true
  if (!firestore || !user.email) return false
  try {
    const ok = (await getDoc(doc(firestore, 'members', normalizeEmail(user.email)))).exists()
    remember(user.uid, ok)
    return ok
  } catch (e) {
    if ((e as { code?: string }).code === 'permission-denied') {
      remember(user.uid, false)
      return false
    }
    try {
      return localStorage.getItem(remembered(user.uid)) === '1'
    } catch {
      return false
    }
  }
}

// ---------- Who can get in (the owner manages it in Cuentas) ----------

export interface Member {
  email: string
  added_at: string
}

export async function listMembers(): Promise<Member[]> {
  const snap = await getDocs(collection(firestore!, 'members'))
  return snap.docs.map((d) => ({ email: d.id, added_at: String(d.get('added_at') ?? '') })).sort((a, b) => a.email.localeCompare(b.email))
}

export async function addMember(email: string) {
  const e = normalizeEmail(email)
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(e)) throw new Error('Ese mail no es válido')
  await setDoc(doc(firestore!, 'members', e), { added_at: now() })
}

export async function removeMember(email: string) {
  await deleteDoc(doc(firestore!, 'members', email))
}
