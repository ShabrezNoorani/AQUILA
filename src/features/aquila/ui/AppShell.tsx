// The app frame: a left sidebar with the main sections, and a page area.
// Each screen draws its own top bar with <Page title=… actions=…>, so the title lives in one place.

import type { ReactNode } from 'react'
import { hrefFor } from '../router'
import { Footer } from './Footer'

export type ShellSection = 'listings' | 'tags' | 'ask' | 'help'

type NavItem = { key: ShellSection; label: string; href: string; icon: ReactNode }

const icon = (d: string) => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
    <path d={d} />
  </svg>
)

const NAV: NavItem[] = [
  { key: 'listings', label: 'Listings', href: hrefFor.listings(), icon: icon('M4 5h12M4 10h12M4 15h12') },
  { key: 'tags', label: 'Tags', href: hrefFor.tags(), icon: icon('M3.5 10.5V4.5a1 1 0 0 1 1-1h6l6 6-7 7-6-6Z M7.5 7.5h.01') },
  { key: 'ask', label: 'Ask AI', href: hrefFor.ask(), icon: icon('M10 3v2M10 15v2M3 10h2M15 10h2M5.5 5.5l1.4 1.4M13.1 13.1l1.4 1.4M5.5 14.5l1.4-1.4M13.1 6.9l1.4-1.4') },
  { key: 'help', label: 'Help', href: hrefFor.help(), icon: icon('M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z M7.9 7.6a2.2 2.2 0 0 1 4.2.9c0 1.5-2.1 1.9-2.1 3.1 M10 14.2h.01') },
]

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <img src="/aquila-logo.png" alt="" aria-hidden="true" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
      <span className="text-sm font-semibold tracking-wide text-ink">AQUILA</span>
    </span>
  )
}

export function AppShell({ active, children }: { active: ShellSection; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink md:flex">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex h-14 items-center px-4">
          <a href={hrefFor.listings()} aria-label="AQUILA home"><Logo /></a>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {NAV.map((item) => {
            const current = item.key === active
            const look = 'flex items-center gap-2.5 rounded-card px-3 py-2 text-sm font-medium transition-colors'
            return (
              <a key={item.key} href={item.href} aria-current={current ? 'page' : undefined}
                className={`${look} ${current ? 'bg-accent/8 text-accent' : 'text-ink-3 hover:bg-paper hover:text-ink'}`}>
                {item.icon}
                {item.label}
              </a>
            )
          })}
        </nav>
      </aside>
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
    </div>
  )
}

type PageProps = {
  /** The page title, shown as the h1 in the top bar. */
  title: ReactNode
  /** Small link above the title, e.g. "← All listings". */
  back?: { href: string; label: string }
  /** A line under the title, e.g. badges. */
  meta?: ReactNode
  /** Buttons on the right of the top bar. */
  actions?: ReactNode
  /** Narrower body, for forms. */
  narrow?: boolean
  children: ReactNode
}

/** A page: a top bar with title and actions, then the content. */
export function Page({ title, back, meta, actions, narrow, children }: PageProps) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className={`mx-auto flex flex-wrap items-center justify-between gap-3 px-6 py-4 ${narrow ? 'max-w-3xl' : 'max-w-6xl'}`}>
          <div className="min-w-0 space-y-1">
            {back && (
              <a href={back.href} className="text-xs font-medium text-ink-3 hover:text-accent">{back.label}</a>
            )}
            <h1 className="truncate text-xl font-semibold text-ink">{title}</h1>
            {meta && <div className="flex flex-wrap items-center gap-2 text-sm text-ink-3">{meta}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </header>
      <div className={`mx-auto space-y-6 px-6 py-6 ${narrow ? 'max-w-3xl' : 'max-w-6xl'}`}>{children}</div>
    </>
  )
}
