// Pure parser for a saved or bookmarked Viator product page.
// Works only on the HTML text it is given: no network requests, no globals besides DOMParser.
//
// Lookup order for each field:
//   1. JSON-LD structured data (<script type="application/ld+json">)
//   2. Viator's embedded page data (<script id="globalState">, also JSON) — needed because
//      JSON-LD has no duration, languages, inclusions or options
//   3. Visible page elements (data-automation="…" markers)

import { computeStatus, emptySnapshotForm, type CaptureStatus, type SnapshotForm } from '../mapping'

// Moved to mapping.ts; re-exported so existing imports keep working.
export { CORE_FIELDS, computeStatus, type CaptureStatus } from '../mapping'

export type MissingField = keyof SnapshotForm | 'option_prices'

export type ParseResult = {
  url: string
  fields: SnapshotForm
  missing: MissingField[]
  status: CaptureStatus
  rawText: string
}

type Json = Record<string, unknown>
type Option = { name: string; description: string | null; price: number | null }

const FIELD_ORDER = Object.keys(emptySnapshotForm()) as (keyof SnapshotForm)[]

// ---------- small helpers ----------

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v])
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(/,/g, '')) : NaN
  return Number.isFinite(n) ? n : null
}

/** Decodes HTML entities and turns <br> into newlines, for strings that came from JSON. */
function htmlToText(s: string): string {
  if (!s) return ''
  const withBreaks = s.replace(/<br\s*\/?>/gi, '\n')
  const doc = new DOMParser().parseFromString(`<body>${withBreaks}</body>`, 'text/html')
  return (doc.body.textContent ?? '')
    .split('\n')
    .map((l) => l.replace(/[ \t\u00A0]+/g, ' ').trim())
    .join('\n')
    .trim()
}

const textOf = (el: Element | null | undefined) => clean(el?.textContent ?? '')
const auto = (root: ParentNode, name: string) => root.querySelector(`[data-automation="${name}"]`)
const autoAll = (root: ParentNode, name: string) => [...root.querySelectorAll(`[data-automation="${name}"]`)]
const first = (...values: string[]) => values.find((v) => v.trim() !== '') ?? ''
const lines = (items: string[]) => items.map(clean).filter(Boolean).join('\n')

// ---------- data sources ----------

function readJsonLd(doc: Document): Json | null {
  const nodes: Json[] = []
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      for (const item of asArray(JSON.parse(script.textContent ?? ''))) {
        if (!isObj(item)) continue
        nodes.push(item, ...asArray(item['@graph']).filter(isObj))
      }
    } catch {
      // Broken JSON-LD is common; skip it and fall back to other sources.
    }
  }
  const types = (n: Json) => asArray(n['@type']).map(str)
  return nodes.find((n) => types(n).some((t) => t === 'Product' || t === 'TouristTrip')) ?? null
}

function readEmbeddedProduct(doc: Document): Json | null {
  try {
    const state = JSON.parse(doc.getElementById('globalState')?.textContent ?? '')
    const product = state?.__PRELOADED_DATA__?.pageModel?.product
    return isObj(product) ? product : null
  } catch {
    return null
  }
}

const get = (obj: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((o, k) => (isObj(o) ? o[k] : undefined), obj)

// ---------- field extractors ----------

function extractTitle(ld: Json | null, doc: Document, state: Json | null) {
  return first(
    htmlToText(str(ld?.name)),
    textOf(auto(doc, 'product-title')),
    textOf(doc.querySelector('h1')),
    str(state?.title),
  )
}

function extractDuration(ld: Json | null, doc: Document, state: Json | null) {
  const fromState = asArray(state?.productAttributes)
    .filter(isObj)
    .find((a) => a.type === 'DURATION')
  const visible = autoAll(doc, 'product-attributes-list')
    .flatMap((ul) => [...ul.querySelectorAll('li')])
    .map(textOf)
    .find((t) => /\b\d+\s*(minute|hour|day)s?\b/i.test(t))
  return first(str(ld?.duration), clean(str(fromState?.label)), visible ?? '')
}

function extractLanguages(ld: Json | null, doc: Document, state: Json | null) {
  const fromLd = [...asArray(ld?.inLanguage), ...asArray(ld?.availableLanguage)]
    .map((l) => (isObj(l) ? str(l.name) : str(l)))
    .filter(Boolean)
  const fromState = asArray(get(state, 'productLanguages', 'offeredLanguages'))
    .map((l) => str(get(l, 'displayName')))
    .filter(Boolean)
  const offered = autoAll(doc, 'product-attributes-list')
    .flatMap((ul) => [...ul.querySelectorAll('li')])
    .map(textOf)
    .find((t) => /^offered in:/i.test(t))
  const fromVisible = (offered ?? '')
    .replace(/^offered in:/i, '')
    .replace(/\band \d+ more\b/i, '')
    .split(/,|\band\b/)
    .map((s) => s.trim())
    .filter(Boolean)
  const list = [fromLd, fromState, fromVisible].find((l) => l.length > 0) ?? []
  return [...new Set(list)].join(', ')
}

function extractGroupType(state: Json | null) {
  // Viator does not show a group type field; only the private-tour flag is reliable.
  return state?.isPrivateTour === true ? 'Private' : ''
}

/** Finds "Highlights:" followed by "- item" lines inside a block of text. */
function highlightsFromText(text: string): string[] {
  const m = text.match(/highlights:?\s*\n((?:\s*[-•*–].*(?:\n|$))+)/i)
  if (!m) return []
  return m[1]
    .split('\n')
    .map((l) => l.replace(/^\s*[-•*–]\s*/, '').trim())
    .filter(Boolean)
}

function extractHighlights(ld: Json | null, doc: Document, state: Json | null) {
  const overview = auto(doc, 'product-overview')
  const visibleText = overview ? htmlToText(overview.innerHTML.replace(/<\/(div|p|li)>/gi, '\n')) : ''
  const candidates = [
    highlightsFromText(htmlToText(str(ld?.description))),
    asArray(get(state, 'description', 'overview', 'features')).map(str),
    overview ? [...overview.querySelectorAll('li')].map(textOf) : [],
    highlightsFromText(visibleText),
  ]
  return lines(candidates.find((c) => c.some((s) => s.trim())) ?? [])
}

function includedLists(doc: Document) {
  // Viator renders two columns: what is included, then what is not.
  const section = auto(doc, 'whats-included-section')
  const uls = section ? [...section.querySelectorAll('ul')] : []
  return uls.map((ul) => [...ul.querySelectorAll('li')].map(textOf))
}

function extractIncluded(doc: Document, state: Json | null, which: 'inclusions' | 'exclusions') {
  const fromState = asArray(get(state, 'description', which, 'features')).map(str)
  const visible = includedLists(doc)[which === 'inclusions' ? 0 : 1] ?? []
  return first(lines(fromState), lines(visible))
}

/** Turns HTML with <br> line breaks into one line per paragraph, dropping blank lines. */
function paragraphs(html: string): string {
  return htmlToText(html)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

/** The "Why Travelers Choose This Tour" heading (either spelling), if the page has one. */
function whyHeading(doc: Document): Element | undefined {
  const scope = auto(doc, 'product-overview') ?? doc
  return [...scope.querySelectorAll('h2, h3, h4')].find((h) =>
    /^why travel+ers choose this tour$/i.test(textOf(h)),
  )
}

function extractOverview(ld: Json | null, doc: Document) {
  const fromLd = paragraphs(str(ld?.description))
  if (fromLd) return fromLd
  // Visible fallback: the first text block in the Overview section, skipping the
  // heading and the "Why Travelers Choose This Tour" block.
  const overview = auto(doc, 'product-overview')
  if (!overview) return ''
  const why = whyHeading(doc)?.parentElement
  const block = [...overview.querySelectorAll('div')].find(
    (d) => d.children.length === [...d.querySelectorAll(':scope > br')].length && textOf(d) && !why?.contains(d),
  )
  return block ? paragraphs(block.innerHTML) : ''
}

function extractWhyThis(doc: Document) {
  // Only the tour's own "Why Travelers Choose This Tour" text. The "Why travelers loved this"
  // review block (tags such as "Great guides" and quoted reviews) is not used.
  const heading = whyHeading(doc)
  const body = heading?.nextElementSibling
  if (!body) return ''
  const items = body.querySelectorAll('li')
  const raw = items.length ? [...items].map((li) => textOf(li)) : htmlToText(body.innerHTML).split('\n')
  return raw
    .map((l) => l.replace(/^\s*[-•*–]\s*/, '').trim())
    .filter(Boolean)
    .join('\n')
}

function extractItinerary(ld: Json | null, doc: Document, state: Json | null) {
  const fromLd = asArray(get(ld, 'itinerary', 'itemListElement'))
    .filter(isObj)
    .sort((a, b) => (num(a.position) ?? 0) - (num(b.position) ?? 0))
    .map((li) => htmlToText(str(get(li, 'item', 'name')) || str(li.name)))
  const fromState = asArray(get(state, 'itinerary', 'itineraryItemList')).flatMap((item) =>
    asArray(get(item, 'itineraryStopList')).map((stop) => str(get(stop, 'locationName'))),
  )
  const visible = autoAll(doc, 'itinerary-item-stop').map((el) => textOf(el.querySelector('h3')))
  return first(lines(fromLd), lines(fromState), lines(visible))
}

const MONEY = /[$€£]\s?\d[\d,]*(?:\.\d+)?/
const PER_PERSON = new RegExp(`^(\\d+)\\s+(?:travel+ers?|adults?)\\s*x\\s*(${MONEY.source})$`, 'i')

const moneyValue = (text: string) => num(text.replace(/[$€£\s]/g, ''))

/** The price shown now inside a tour-grade-price element, ignoring struck-through originals. */
function currentPrice(priceEl: Element): number | null {
  const copy = priceEl.cloneNode(true) as Element
  copy
    .querySelectorAll('s, del, strike, [style*="line-through"], [data-automation="special-offer-deal"]')
    .forEach((el) => el.remove())
  const first = (copy.textContent ?? '').match(MONEY)?.[0]
  return first ? moneyValue(first) : null
}

/**
 * The tour date picked in the booking date box, e.g. "Wed, Nov 25" → "Nov 25".
 * This is the date the shown prices are for. The "on Nov 24" inside an option block is
 * the free-cancellation deadline, so it is not used.
 */
function pickedTourDate(doc: Document): string {
  const input = auto(doc, 'availability-date-picker-input')
  const text = input?.getAttribute('value') || (input as HTMLInputElement | null)?.value || textOf(input)
  return text?.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}\b/i)?.[0] ?? ''
}

/** Options from the visible blocks marked data-automation="tour-grade-N". */
function visibleOptions(doc: Document): Option[] {
  const date = pickedTourDate(doc)
  const blocks = [...doc.querySelectorAll('[data-automation^="tour-grade-"]')].filter((el) =>
    /^tour-grade-\d+$/.test(el.getAttribute('data-automation') ?? ''),
  )
  return blocks
    .map((block) => {
      const name = textOf(block.querySelector('[role="heading"]')) || textOf(block.querySelector('label'))
      const priceEl = block.querySelector('[data-automation="tour-grade-price"]')
      if (!priceEl) return { name, description: null, price: null }
      // "2 Travelers x $73.99" / "2 Adults x $95.20": match whole elements only, because the
      // block's combined text runs the total into the count ("$147.982 Travelers").
      const perPerson = [...block.querySelectorAll('*')]
        .map((el) => textOf(el).match(PER_PERSON))
        .find((m) => m !== null)
      if (perPerson) {
        const n = Number(perPerson[1])
        const priced = `Priced for ${n} ${n === 1 ? 'traveler' : 'travelers'}`
        return { name, description: date ? `${priced}, ${date}` : priced, price: moneyValue(perPerson[2]) }
      }
      return { name, description: null, price: currentPrice(priceEl) }
    })
    .filter((o) => o.name)
}

function extractOptions(ld: Json | null, html: string, state: Json | null, doc: Document): Option[] {
  // 1. JSON-LD offers that carry their own name.
  const offers = asArray(ld?.offers)
    .flatMap((o) => (isObj(o) && o['@type'] === 'AggregateOffer' ? asArray(o.offers) : [o]))
    .filter(isObj)
  const named = offers
    .filter((o) => str(o.name).trim())
    .map((o) => ({ name: htmlToText(str(o.name)), description: null, price: num(o.price) }))
  if (named.length) return named

  // 2. Visible option blocks (with prices when shown), in page order.
  const visible = visibleOptions(doc)

  // 3. Embedded option names, in the page's sort order. Any not shown as a block are added
  //    after the visible ones, with a blank price. The page's "from" price is never used.
  const names = get(state, 'tourGradeNames')
  const embedded: Option[] = []
  if (isObj(names)) {
    const order = (html.match(/"tourGradeSortOrder":\[([^\]]*)\]/)?.[1] ?? '')
      .split(',')
      .map((s) => s.replace(/"/g, '').trim())
      .filter((code) => code in names)
    const codes = [...new Set([...order, ...Object.keys(names)])]
    for (const code of codes) {
      const name = clean(str(names[code]))
      if (name) embedded.push({ name, description: null, price: null })
    }
  }
  const seen = new Set(visible.map((o) => o.name.toLowerCase()))
  return [...visible, ...embedded.filter((o) => !seen.has(o.name.toLowerCase()))]
}

function formatOptions(options: Option[]) {
  return options
    .map((o) => {
      const name = o.name.replace(/\|/g, '/')
      const description = (o.description ?? '').replace(/\|/g, '/')
      if (o.price == null && !description) return name
      return `${name} | ${description} | ${o.price ?? ''}`
    })
    .join('\n')
}

/** The visible one-decimal review score, e.g. "4.7". */
function visibleRating(doc: Document, pageText: string): number | null {
  // 1. The score beside the "Why travelers loved this" heading.
  const shelfHeader = auto(doc, 'highlighted-reviews-shelf')?.querySelector('h2')?.nextElementSibling
  const scoreEl = shelfHeader
    ? [...shelfHeader.querySelectorAll('*')].find((el) => el.children.length === 0 && /^\d(\.\d)?$/.test(textOf(el)))
    : undefined
  if (scoreEl) return num(textOf(scoreEl))
  // 2. The Reviews summary: "4.7 based on 283 reviews".
  const summary = pageText.match(/(\d(?:\.\d)?)\s*based on\s*[\d,]+\s*reviews/i)
  return summary ? num(summary[1]) : null
}

function extractRating(ld: Json | null, doc: Document, state: Json | null, pageText: string) {
  // The visible score comes first. The star icons and JSON-LD round to the nearest half star
  // (4.7 shows as 4.5), so they are only used when no visible score exists.
  const value = [
    visibleRating(doc, pageText),
    num(get(state, 'rating', 'exactScore')),
    num(get(ld, 'aggregateRating', 'ratingValue')),
    num(get(state, 'rating', 'score')),
  ].find((n) => n !== null && n >= 0 && n <= 5)
  return value == null ? '' : value.toFixed(1)
}

function extractReviewCount(ld: Json | null, doc: Document, state: Json | null) {
  const visible = textOf(auto(doc, 'title-review-link')).match(/([\d,]+)\s+Reviews?/i)?.[1]
  const value = [
    num(get(ld, 'aggregateRating', 'reviewCount')),
    num(get(ld, 'aggregateRating', 'ratingCount')),
    num(get(state, 'rating', 'reviewCount')),
    num(visible),
  ].find((n) => n !== null)
  return value == null ? '' : String(Math.round(value))
}

/** The separate text pieces of a banner, e.g. ["High interest", "Booked 4 times today."]. */
function bannerParts(el: Element | null): string[] {
  if (!el) return []
  const spans = [...el.querySelectorAll('span')].map(textOf).filter(Boolean)
  return spans.length ? spans : [textOf(el)].filter(Boolean)
}

function extractUrgency(doc: Document, state: Json | null) {
  const parts: string[] = []
  const popularity = bannerParts(auto(doc, 'popularity-messages-wrapper'))
  if (popularity.length) {
    // "High interest" + "Booked 4 times today." → "High interest: Booked 4 times today."
    // but "Very popular!" + "10+ bookings…" keeps its own punctuation.
    parts.push(popularity.reduce((acc, p) => (/[!?.:]$/.test(acc) ? `${acc} ${p}` : `${acc}: ${p}`)))
  }
  if (get(state, 'pricing', 'isLikelyToSellOut') === true) parts.push('Likely to Sell Out')
  const bookAhead = bannerParts(auto(doc, 'booking-in-advance-banner'))
  if (bookAhead.length) parts.push(bookAhead.join(' '))
  return parts.join(' · ')
}

function readableText(doc: Document) {
  const body = doc.body?.cloneNode(true) as HTMLElement | undefined
  if (!body) return ''
  body.querySelectorAll('script, style, noscript, template, svg').forEach((el) => el.remove())
  return clean(body.textContent ?? '')
}

// ---------- entry point ----------

export function parseViatorListing(html: string, url: string): ParseResult {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const ld = readJsonLd(doc)
  const state = readEmbeddedProduct(doc)
  const options = extractOptions(ld, html, state, doc)
  const rawText = readableText(doc)

  const fields: SnapshotForm = {
    title: extractTitle(ld, doc, state),
    overview: extractOverview(ld, doc),
    duration: extractDuration(ld, doc, state),
    languages: extractLanguages(ld, doc, state),
    group_type: extractGroupType(state),
    highlights: extractHighlights(ld, doc, state),
    inclusions: extractIncluded(doc, state, 'inclusions'),
    exclusions: extractIncluded(doc, state, 'exclusions'),
    why_this: extractWhyThis(doc),
    itinerary: extractItinerary(ld, doc, state),
    options: formatOptions(options),
    rating: extractRating(ld, doc, state, rawText),
    review_count: extractReviewCount(ld, doc, state),
    urgency_text: extractUrgency(doc, state),
  }

  const missing: MissingField[] = FIELD_ORDER.filter((k) => fields[k].trim() === '')
  if (options.some((o) => o.price == null)) missing.push('option_prices')

  return {
    url: url || str(ld?.url),
    fields,
    missing,
    status: computeStatus(fields),
    rawText,
  }
}
