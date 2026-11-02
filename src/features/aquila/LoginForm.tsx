import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { Button, inputClass } from './ui'

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
    // Covers the whole window, so the sign-in screen has the same light look as the app.
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-paper p-6 text-ink">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5 rounded-card border border-line bg-surface p-7 shadow-md shadow-ink/8">
        <div className="space-y-3">
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-base font-bold text-surface">A</span>
          <h1 className="text-xl font-semibold">Sign in to AQUILA</h1>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="login-email" className="block text-sm font-medium">Email</label>
          <input
            id="login-email" type="email" required placeholder="Email" value={email} autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="login-password" className="block text-sm font-medium">Password</label>
          <input
            id="login-password" type="password" required placeholder="Password" value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>
        {error && <p role="alert" className="text-sm text-negative-deep">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy} className="w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}
