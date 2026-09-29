import { onAuthStateChanged, type User } from 'firebase/auth'
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AccountsPage } from './components/AccountsPage'
import { CalendarView } from './components/calendar/CalendarView'
import { DrivePicker } from './components/drive/DrivePicker'
import { DriveView } from './components/drive/DriveView'
import { Home } from './components/Home'
import { MailView } from './components/mail/MailView'
import { NotificationsPage } from './components/NotificationsPage'
import { Login } from './components/Login'
import { PageView } from './components/PageView'
import { SearchPalette } from './components/SearchPalette'
import { Sidebar } from './components/Sidebar'
import { TrashView } from './components/TrashView'
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

const rootRoute = createRootRoute({ component: Layout })
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Home })
const pageRoute = createRoute({ getParentRoute: () => rootRoute, path: '/p/$pageId', component: PageRoute })
const trashRoute = createRoute({ getParentRoute: () => rootRoute, path: '/trash', component: TrashView })
const calendarRoute = createRoute({ getParentRoute: () => rootRoute, path: '/calendar', component: CalendarView })
const driveRoute = createRoute({ getParentRoute: () => rootRoute, path: '/drive', component: DriveView })
const accountsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/accounts', component: AccountsPage })
const mailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/mail', component: MailView })
const notificationsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/notifications', component: NotificationsPage })
const routeTree = rootRoute.addChildren([
  homeRoute,
  pageRoute,
  trashRoute,
  calendarRoute,
  driveRoute,
  accountsRoute,
  mailRoute,
  notificationsRoute,
])

function PageRoute() {
  const { pageId } = pageRoute.useParams()
  return <PageView key={pageId} pageId={pageId} />
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

  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : undefined), [])

  const userId = user?.uid
  useEffect(() => (userId ? startSync(userId) : undefined), [userId])
  useTaskSnapshot(userId)

  if (auth && user === undefined) return null
  if (auth && !user) return <Login />
  return <RouterProvider router={router} />
}
