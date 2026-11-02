// Pure text-parsing helpers for the manual snapshot form.

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

export type ProductOption = {
  name: string
  description: string | null
  price: number | null
}

/** One item per line; trims each line and drops blank ones. */
export function linesToArray(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Comma-separated list; trims each item and drops empty ones. */
export function commaListToArray(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Parses a price like "120", "1,250.50" or "$99". Empty → null. */
export function parsePrice(text: string): Parsed<number | null> {
  const raw = text.trim()
  if (!raw) return { ok: true, value: null }
  const cleaned = raw.replace(/^[$€£]/, '').replace(/,/g, '').trim()
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return { ok: false, error: `Invalid price "${raw}" (use a number like 120 or 99.50)` }
  }
  return { ok: true, value: Number(cleaned) }
}

/** Parses one "name | description | price" line. */
export function parseOptionLine(line: string): Parsed<ProductOption> {
  const parts = line.split('|').map((s) => s.trim())
  if (parts.length > 3) {
    return { ok: false, error: 'Too many "|" separators (use name | description | price)' }
  }
  const [name = '', description = '', priceText = ''] = parts
  if (!name) return { ok: false, error: 'Option name is required' }
  const price = parsePrice(priceText)
  if (!price.ok) return price
  return { ok: true, value: { name, description: description || null, price: price.value } }
}

/** Parses the options textarea: one option per non-blank line. */
export function parseOptions(text: string): Parsed<ProductOption[]> {
  const out: ProductOption[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const r = parseOptionLine(lines[i])
    if (!r.ok) return { ok: false, error: `Line ${i + 1}: ${r.error}` }
    out.push(r.value)
  }
  return { ok: true, value: out }
}

/** Rating 0–5, decimals allowed. Empty → null. */
export function parseRating(text: string): Parsed<number | null> {
  const raw = text.trim()
  if (!raw) return { ok: true, value: null }
  const n = Number(raw)
  if (!/^\d+(\.\d+)?$/.test(raw) || n < 0 || n > 5) {
    return { ok: false, error: 'Rating must be a number from 0 to 5' }
  }
  return { ok: true, value: n }
}

/** Whole, non-negative number; thousands separators allowed. Empty → null. */
export function parseReviewCount(text: string): Parsed<number | null> {
  const raw = text.trim().replace(/,/g, '')
  if (!raw) return { ok: true, value: null }
  if (!/^\d+$/.test(raw)) return { ok: false, error: 'Review count must be a whole number' }
  return { ok: true, value: Number(raw) }
}
