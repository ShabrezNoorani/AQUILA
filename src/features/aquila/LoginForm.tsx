import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { Button, inputClass } from './ui'
import { Footer } from './ui/Footer'

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
    // Covers the whole window: paper background, a faint grid, a warm glow, the card, then the footer.
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-paper text-ink">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-line)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40" />
        <div className="absolute -top-48 -right-48 h-[32rem] w-[32rem] rounded-full bg-accent/10 blur-3xl" />
      </div>

      <main className="relative flex flex-1 items-center justify-center p-6">
        <form onSubmit={handleSubmit}
          className="w-full max-w-sm space-y-6 rounded-card border border-line bg-surface p-8 shadow-xl shadow-ink/8 sm:p-10">
          <div className="space-y-5 text-center">
            <div className="flex items-center justify-center gap-3">
              <img src="/aquila-logo.png" alt="" aria-hidden="true" className="h-14 w-14 rounded-card object-cover" />
              <span className="text-2xl leading-none font-black tracking-wider text-accent uppercase">AQUILA</span>
            </div>
            <div className="space-y-1.5">
              <h1 className="font-['Fraunces',Georgia,serif] text-3xl font-semibold text-ink">Welcome back</h1>
              <p className="text-sm text-ink-3">Sign in to your AQUILA dashboard.</p>
            </div>
          </div>
          <div className="space-y-4">
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
          </div>
          {error && <p role="alert" className="text-sm text-negative-deep">{error}</p>}
          <Button type="submit" variant="primary" disabled={busy} className="h-10 w-full">
            {busy ? 'Signing in…' : <>Sign in <span aria-hidden="true">→</span></>}
          </Button>
        </form>
      </main>

      <Footer className="relative" />
    </div>
  )
}
