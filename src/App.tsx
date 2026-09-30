import { onAuthStateChanged, type User } from 'firebase/auth'
import { createRootRoute, createRoute, createRouter, Navigate, Outlet, RouterProvider } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useState } from 'react'
import { AccountsPage } from './components/AccountsPage'
import type { InkSearch } from './components/ink/InkEditor'
import { CalendarView } from './components/calendar/CalendarView'
import { DrivePicker } from './components/drive/DrivePicker'
import { DriveView } from './components/drive/DriveView'
import { Home } from './components/Home'
import { ImportPage } from './components/ImportPage'
import { MailView } from './components/mail/MailView'
import { NotebooksView } from './components/ink/NotebooksView'
import { NotificationsPage } from './components/NotificationsPage'
import { Login, NoAccess } from './components/Login'
import { Splash } from './components/Splash'
import { PageView } from './components/PageView'
import { SearchPalette } from './components/SearchPalette'
import { Sidebar } from './components/Sidebar'
import { TodayView } from './components/today/TodayView'
import { TrashView } from './components/TrashView'
import { checkAccess, OWNER } from './lib/access'
import { startInkSync } from './lib/ink/store'
import { useTaskSnapshot } from './lib/notifications'
import { startSync } from './lib/sync'
import { useApplyTheme } from './lib/theme'
import { auth } from './lib/firebase'
import { useUI } from './lib/ui-store'
import { cx } from './lib/util'

function Layout() {
  const sidebarOpen = useUI((s) => s.sidebarOpen)
  const setSidebarOpen = useUI((s) => s.setSidebarOpen)
  return (
    <div className="flex h-full">
      <aside
        className={cx(
          'z-40 h-full flex-none border-r border-line transition-transform max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:shadow-xl',
          !sidebarOpen && 'max-md:-translate-x-full',
        )}
      >
        <Sidebar />
      </aside>
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />}
      <main className="h-full min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <SearchPalette />
      <DrivePicker />
    </div>
  )
}

// Unknown addresses (old links, leftovers from a sign-in) go home instead of a blank screen.
const rootRoute = createRootRoute({ component: Layout, notFoundComponent: () => <Navigate to="/" replace /> })
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Home })
const pageRoute = createRoute({ getParentRoute: () => rootRoute, path: '/p/$pageId', component: PageRoute })
const trashRoute = createRoute({ getParentRoute: () => rootRoute, path: '/trash', component: TrashView })
const calendarRoute = createRoute({ getParentRoute: () => rootRoute, path: '/calendar', component: CalendarView })
const driveRoute = createRoute({ getParentRoute: () => rootRoute, path: '/drive', component: DriveView })
const accountsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/accounts', component: AccountsPage })
const mailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/mail', component: MailView })
const notificationsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/notifications', component: NotificationsPage })
const todayRoute = createRoute({ getParentRoute: () => rootRoute, path: '/today', component: TodayView })
const importRoute = createRoute({ getParentRoute: () => rootRoute, path: '/import', component: ImportPage })
const notebooksRoute = createRoute({ getParentRoute: () => rootRoute, path: '/notebooks', component: NotebooksView })
const inkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ink/$docId',
  validateSearch: (s: Record<string, unknown>): InkSearch => {
    const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
    return { a: str(s.a), f: str(s.f), d: str(s.d) }
  },
  component: InkRoute,
})
const routeTree = rootRoute.addChildren([
  homeRoute,
  importRoute,
  todayRoute,
  pageRoute,
  trashRoute,
  calendarRoute,
  driveRoute,
  accountsRoute,
  mailRoute,
  notificationsRoute,
  inkRoute,
  notebooksRoute,
])

function PageRoute() {
  const { pageId } = pageRoute.useParams()
  return <PageView key={pageId} pageId={pageId} />
}

// The notebook editor brings pdf.js and the pencil code: loaded only when a notebook opens.
const InkEditor = lazy(() => import('./components/ink/InkEditor').then((m) => ({ default: m.InkEditor })))

function InkRoute() {
  const { docId } = inkRoute.useParams()
  const search = inkRoute.useSearch()
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[45] bg-bg" />}>
      <InkEditor key={docId} docId={docId} search={search} />
    </Suspense>
  )
}

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export function App() {
  useApplyTheme()
  const [user, setUser] = useState<User | null | undefined>(auth ? undefined : null)
  // Signed in isn't enough: only the owner and the accounts they added get in (see lib/access).
  const [allowed, setAllowed] = useState<{ uid: string; ok: boolean } | null>(null)

  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : undefined), [])
  useEffect(() => {
    if (!user) return
    let stop = false
    checkAccess(user).then((ok) => !stop && setAllowed({ uid: user.uid, ok }))
    return () => {
      stop = true
    }
  }, [user])

  const access = user && allowed?.uid === user.uid ? allowed.ok : undefined
  // Every allowed account works in the owner's space.
  const space = access ? OWNER : undefined
  useEffect(() => (space ? startSync(space) : undefined), [space])
  useEffect(() => (space ? startInkSync() : undefined), [space])
  useTaskSnapshot(space)

  if (auth && user === undefined) return <Splash />
  if (auth && !user) return <Login />
  if (auth && user && access === undefined) return <Splash />
  if (auth && user && !access) return <NoAccess email={user.email} />
  return <RouterProvider router={router} />
}
