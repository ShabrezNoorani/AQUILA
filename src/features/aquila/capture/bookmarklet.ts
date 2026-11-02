// The bookmark the user clicks on a Viator page.
// It copies {"url": …, "html": …} for the current page to the clipboard and does nothing else:
// no network requests, no page changes beyond a hidden textarea used only if the
// Clipboard API is unavailable.

const source = [
  '(()=>{',
  'const t=JSON.stringify({url:location.href,html:document.documentElement.outerHTML});',
  'const c=()=>{const a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();document.execCommand("copy");a.remove()};',
  'navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(t).catch(c):c()',
  '})()',
].join('')

export const BOOKMARKLET = `javascript:${source}`

export type BookmarkPayload =
  | { ok: true; url: string; html: string }
  | { ok: false; error: string }

const NOT_OUTPUT = 'That is not AQUILA bookmark output. Click the bookmark on a Viator page, then paste here.'

/** Validates text pasted from the clipboard after clicking the bookmark. */
export function parseBookmarkPayload(text: string): BookmarkPayload {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: 'Paste the bookmark output first.' }

  let data: unknown
  try {
    data = JSON.parse(trimmed)
  } catch {
    return { ok: false, error: NOT_OUTPUT }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ok: false, error: NOT_OUTPUT }

  const { url, html } = data as { url?: unknown; html?: unknown }
  if (typeof html !== 'string' || !/<[a-z!]/i.test(html)) {
    return { ok: false, error: 'The bookmark output has no page HTML in it.' }
  }
  if (typeof url !== 'string' || !/^https?:\/\/\S+$/i.test(url)) {
    return { ok: false, error: 'The bookmark output has no valid page URL in it.' }
  }
  return { ok: true, url, html }
}
