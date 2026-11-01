import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { OWNER_USER_ID } from '../../lib/owner'
import LoginForm from './LoginForm'

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

  if (!ready) return <p className="p-8">Loading…</p>

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6">
        <LoginForm />
      </div>
    )
  }

  if (session.user.id !== OWNER_USER_ID) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-900 text-white">
        <h1 className="text-2xl font-bold">Not authorized</h1>
        <button onClick={() => supabase.auth.signOut()}
          className="rounded bg-white px-3 py-2 text-slate-900">
          Sign out
        </button>
      </div>
    )
  }

  return <>{children}</>
}
