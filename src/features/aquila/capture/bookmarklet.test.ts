import { afterEach, describe, expect, it, vi } from 'vitest'
import { BOOKMARKLET, parseBookmarkPayload } from './bookmarklet'

describe('BOOKMARKLET', () => {
  it('is a single-line javascript: URL', () => {
    expect(BOOKMARKLET.startsWith('javascript:')).toBe(true)
    expect(BOOKMARKLET).not.toMatch(/[\r\n]/)
  })

  it('contains no network calls', () => {
    for (const banned of ['fetch', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'import(', '.src', 'location.href=', 'open(']) {
      expect(BOOKMARKLET).not.toContain(banned)
    }
  })

  describe('when run', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('copies JSON with the page URL and HTML to the clipboard, and nothing else', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      document.documentElement.innerHTML = '<head></head><body><h1>Hello</h1></body>'

      new Function(BOOKMARKLET.slice('javascript:'.length))()
      await Promise.resolve()

      expect(writeText).toHaveBeenCalledTimes(1)
      const payload = JSON.parse(writeText.mock.calls[0][0])
      expect(Object.keys(payload).sort()).toEqual(['html', 'url'])
      expect(payload.url).toBe(window.location.href)
      expect(payload.html).toContain('<h1>Hello</h1>')
    })
  })
})

describe('parseBookmarkPayload', () => {
  const good = JSON.stringify({ url: 'https://www.viator.com/tours/x', html: '<html><body>hi</body></html>' })

  it('accepts valid bookmark output', () => {
    expect(parseBookmarkPayload(`  ${good}\n`)).toEqual({
      ok: true,
      url: 'https://www.viator.com/tours/x',
      html: '<html><body>hi</body></html>',
    })
  })

  it.each([
    ['empty text', '   '],
    ['plain text', 'hello there'],
    ['broken JSON', '{"url": "https://x.com", "html": '],
    ['a JSON array', '[1,2]'],
    ['missing html', JSON.stringify({ url: 'https://www.viator.com/x' })],
    ['empty html', JSON.stringify({ url: 'https://www.viator.com/x', html: '  ' })],
    ['html that is not markup', JSON.stringify({ url: 'https://www.viator.com/x', html: 'just words' })],
    ['missing url', JSON.stringify({ html: '<html></html>' })],
    ['a non-http url', JSON.stringify({ url: 'javascript:alert(1)', html: '<html></html>' })],
  ])('rejects %s', (_label, text) => {
    const r = parseBookmarkPayload(text)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0)
  })
})
