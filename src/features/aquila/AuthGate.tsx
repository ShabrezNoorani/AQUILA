import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { OWNER_USER_ID } from '../../lib/owner'
import LoginForm from './LoginForm'
import { buttonClass } from './ui'
import { Footer } from './ui/Footer'

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col bg-paper text-ink">
        <p className="flex-1 p-8 text-ink-3">Loading…</p>
        <Footer />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper text-ink p-6">
        <LoginForm />
      </div>
    )
  }

  if (session.user.id !== OWNER_USER_ID) {
    return (
      <div className="flex min-h-screen flex-col bg-paper text-ink">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <h1 className="text-xl font-semibold">Not authorized</h1>
          <button onClick={() => supabase.auth.signOut()}
            className={buttonClass('secondary')}>
            Sign out
          </button>
        </div>
        <Footer />
      </div>
    )
  }

  return <>{children}</>
}
