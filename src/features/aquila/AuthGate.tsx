import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { OWNER_USER_ID } from '../../lib/owner'
import LoginForm from './LoginForm'
import { buttonClass } from './ui'

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

  if (!ready) return <p className="min-h-screen bg-paper p-8 text-ink-3">Loading…</p>

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper text-ink p-6">
        <LoginForm />
      </div>
    )
  }

  if (session.user.id !== OWNER_USER_ID) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-paper text-ink">
        <h1 className="text-xl font-semibold">Not authorized</h1>
        <button onClick={() => supabase.auth.signOut()}
          className={buttonClass('secondary')}>
          Sign out
        </button>
      </div>
    )
  }

  return <>{children}</>
}
