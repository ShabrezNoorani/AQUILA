import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { supabase } from '../../lib/supabase'
import { OWNER_USER_ID } from '../../lib/owner'
import AuthGate from './AuthGate'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(),
      signInWithPassword: vi.fn(),
    },
  },
}))

const getSession = vi.mocked(supabase.auth.getSession)
const sessionFor = (id: string) => ({ data: { session: { user: { id } } }, error: null }) as never

beforeEach(() => {
  getSession.mockReset()
  vi.mocked(supabase.auth.signOut).mockReset()
})

describe('AuthGate', () => {
  it('shows the footer on the loading screen', () => {
    getSession.mockReturnValue(new Promise(() => {}) as never)
    render(<AuthGate><p>app</p></AuthGate>)
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.getByRole('contentinfo').textContent).toBe('MADE IN PARIS · © 2026')
  })

  it('shows the sign-in page, with its footer, when nobody is signed in', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null } as never)
    render(<AuthGate><p>app</p></AuthGate>)
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1)
    expect(screen.queryByText('app')).toBeNull()
  })

  it('shows "Not authorized" with the footer and a working Sign out for another user', async () => {
    getSession.mockResolvedValue(sessionFor('someone-else'))
    render(<AuthGate><p>app</p></AuthGate>)
    expect(await screen.findByRole('heading', { name: 'Not authorized' })).toBeTruthy()
    expect(screen.getByRole('contentinfo').textContent).toBe('MADE IN PARIS · © 2026')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(supabase.auth.signOut).toHaveBeenCalled()
    expect(screen.queryByText('app')).toBeNull()
  })

  it('shows the app for the owner', async () => {
    getSession.mockResolvedValue(sessionFor(OWNER_USER_ID))
    render(<AuthGate><p>app</p></AuthGate>)
    expect(await screen.findByText('app')).toBeTruthy()
  })
})
