import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import manual from './AQUILA-Manual.md?raw'
import HelpPage from './HelpPage'
import { MANUAL_FILE_NAME } from './downloadManual'
import { hrefFor, parseHash } from '../router'

afterEach(() => {
  vi.restoreAllMocks()
})

/** Stubs the browser download APIs jsdom lacks, and records what would be saved. */
function captureDownload() {
  const saved: { blob?: Blob; name?: string; clicked: boolean; revoked?: string } = { clicked: false }
  Object.assign(URL, {
    createObjectURL: vi.fn((b: Blob) => {
      saved.blob = b
      return 'blob:manual'
    }),
    revokeObjectURL: vi.fn((u: string) => {
      saved.revoked = u
    }),
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.clicked = true
    saved.name = this.download
    expect(this.href).toBe('blob:manual')
  })
  return saved
}

describe('HelpPage', () => {
  it('has a real manual to show', () => {
    expect(manual.length).toBeGreaterThan(1000)
    expect(manual).toMatch(/^# AQUILA/)
  })

  it('shows the whole manual text, keeping line breaks, without turning markdown into HTML', () => {
    render(<HelpPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeTruthy()
    const article = screen.getByRole('article', { name: 'AQUILA manual' })
    const body = article.firstElementChild as HTMLElement
    expect(body.textContent).toBe(manual)
    expect(body.className).toContain('whitespace-pre-wrap')
    expect(body.className).toContain('max-w-prose')
    // Shown as plain text: no markdown headings or tables are rendered.
    expect(article.querySelector('h2, table, strong')).toBeNull()
  })

  it('downloads the exact manual text as AQUILA-Manual.md', async () => {
    const saved = captureDownload()
    render(<HelpPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Download manual' }))
    expect(saved.clicked).toBe(true)
    expect(saved.name).toBe('AQUILA-Manual.md')
    expect(MANUAL_FILE_NAME).toBe('AQUILA-Manual.md')
    expect(saved.blob!.type).toBe('text/markdown;charset=utf-8')
    expect(await saved.blob!.text()).toBe(manual)
    expect(saved.revoked).toBe('blob:manual')
    expect(document.querySelector('a[download]')).toBeNull()
  })
})

describe('#/help route', () => {
  it('maps to the help page', () => {
    expect(parseHash('#/help')).toEqual({ name: 'help' })
    expect(parseHash(hrefFor.help())).toEqual({ name: 'help' })
  })
})
