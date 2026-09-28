import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

const app = config.apiKey && config.projectId ? initializeApp(config) : null

/** null when the app runs in local-only mode (no Firebase configured). */
export const auth = app ? getAuth(app) : null
// Dexie is the local store, so Firestore only needs an in-memory cache.
export const firestore = app ? initializeFirestore(app, { localCache: memoryLocalCache() }) : null
export const googleProvider = new GoogleAuthProvider()

/** Base URL of the Vercel functions ('' in dev: Vite serves /api). */
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
