import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Sign in to AQUILA</h1>
      <input
        type="email" required placeholder="Email" value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded bg-slate-800 px-3 py-2"
      />
      <input
        type="password" required placeholder="Password" value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded bg-slate-800 px-3 py-2"
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full rounded bg-white px-3 py-2 font-semibold text-slate-900 disabled:opacity-50">
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
