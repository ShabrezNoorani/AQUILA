import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { supabase } from '../../lib/supabase'
import LoginForm from './LoginForm'

vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signInWithPassword: vi.fn() } } }))

const signIn = vi.mocked(supabase.auth.signInWithPassword)

beforeEach(() => {
  signIn.mockReset()
})

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'me@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
  fireEvent.click(screen.getByRole('button', { name: /Sign in/ }))
}

describe('LoginForm', () => {
  it('shows the logo, the gold AQUILA wordmark, the heading and the subheading', () => {
    const { container } = render(<LoginForm />)
    const logo = container.querySelector('img')
    expect(logo?.getAttribute('src')).toBe('/aquila-logo.png')
    expect(logo?.className).toContain('h-14')
    expect(screen.getByText('AQUILA').className).toContain('text-accent')
    const heading = screen.getByRole('heading', { level: 1, name: 'Welcome back' })
    expect(heading.className).toContain('Fraunces')
    expect(heading.className).toContain('font-semibold')
    expect(screen.getByText('Sign in to your AQUILA dashboard.')).toBeTruthy()
  })

  it('has no forgot-password, sign-up, guest or invite text', () => {
    const { container } = render(<LoginForm />)
    expect(container.textContent).not.toMatch(/forgot|sign up|sign-up|guest|invite|create account/i)
  })

  it('has a full-width gold Sign in button with an arrow, and the footer', () => {
    render(<LoginForm />)
    const button = screen.getByRole('button', { name: /Sign in/ })
    expect(button.getAttribute('type')).toBe('submit')
    expect(button.className).toContain('w-full')
    expect(button.textContent).toBe('Sign in →')
    expect(screen.getByRole('contentinfo').textContent).toBe('MADE IN PARIS · © 2026')
  })

  it('signs in with the email and password typed', async () => {
    signIn.mockResolvedValue({ data: {}, error: null } as never)
    render(<LoginForm />)
    fillAndSubmit()
    await waitFor(() => expect(signIn).toHaveBeenCalledWith({ email: 'me@example.com', password: 'secret' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Sign in/ })).toBeTruthy())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the error message when sign-in fails', async () => {
    signIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } } as never)
    render(<LoginForm />)
    fillAndSubmit()
    expect((await screen.findByRole('alert')).textContent).toBe('Invalid login credentials')
  })
})
