import type { Session } from '@supabase/supabase-js'
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { CalendarView } from './components/calendar/CalendarView'
import { Home } from './components/Home'
import { Login } from './components/Login'
import { PageView } from './components/PageView'
import { SearchPalette } from './components/SearchPalette'
import { Sidebar } from './components/Sidebar'
import { TrashView } from './components/TrashView'
import { startSync } from './lib/sync'
import { supabase } from './lib/supabase'
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
    </div>
  )
}

const rootRoute = createRootRoute({ component: Layout })
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Home })
const pageRoute = createRoute({ getParentRoute: () => rootRoute, path: '/p/$pageId', component: PageRoute })
const trashRoute = createRoute({ getParentRoute: () => rootRoute, path: '/trash', component: TrashView })
const calendarRoute = createRoute({ getParentRoute: () => rootRoute, path: '/calendar', component: CalendarView })
const routeTree = rootRoute.addChildren([homeRoute, pageRoute, trashRoute, calendarRoute])

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
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => (userId ? startSync(userId) : undefined), [userId])

  if (supabase && session === undefined) return null
  if (supabase && !session) return <Login />
  return <RouterProvider router={router} />
}
