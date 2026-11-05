// AQUILA "Ask AI" Edge Function.
//
// POST { question: string, tag_ids: string[] } with the caller's Supabase login.
//  1. Only the AQUILA owner may call it (403 for anyone else).
//  2. Reads listing data with the caller's own token, so row-level security applies.
//     Only these tables are read: mt_listings, mt_listing_tags, mt_tags, mt_snapshots,
//     mt_snapshot_options, mt_timing_rules, mt_reviews, mt_companies.
//  3. Groups the data by the chosen place tags and asks Gemini.
//  4. Saves one row to mt_suggestions and returns the answer with the listing and snapshot ids used.
//
// It talks to Supabase and Gemini with plain fetch and has no imports, so the same code runs on
// Deno (Supabase Edge Runtime) and under the app's tests, which pass in a fake fetch.
// The Gemini key is read from the AQUILA_GEMINI_KEY secret and never leaves this function.

/** The one place the Gemini model is named. */
export const GEMINI_MODEL = 'gemini-flash-lite-latest'

/** Only this Supabase user may use AQUILA (same id as src/lib/owner.ts). */
export const OWNER_USER_ID = '34baa0f9-5f19-47a9-8129-60e6da9853b3'

/** The only tables this function reads. */
export const READ_TABLES = [
  'mt_listings',
  'mt_listing_tags',
  'mt_tags',
  'mt_snapshots',
  'mt_snapshot_options',
  'mt_timing_rules',
  'mt_reviews',
  'mt_companies',
] as const
type ReadTable = (typeof READ_TABLES)[number]

/** The only table this function writes. */
export const SUGGESTIONS_TABLE = 'mt_suggestions'

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const MAX_QUESTION = 2000
const MAX_TAGS = 50

/** Snapshot columns sent to the model. raw_html, raw_text and the old options column are left out. */
const SNAPSHOT_COLUMNS = [
  'id', 'listing_id', 'captured_at', 'method', 'status', 'title', 'overview', 'duration', 'languages',
  'group_type', 'highlights', 'inclusions', 'exclusions', 'why_this', 'itinerary', 'rating',
  'review_count', 'urgency_text',
].join(',')

export const SYSTEM_PROMPT = [
  'You answer questions about tour listings for the owner of a tour business.',
  'Use only the JSON data you are given. It is grouped by the place tags the owner chose.',
  'Each listing has a "company": its name, and "own": true when it is the owner\'s own company (OWN). Every other company is a competitor; "company" is null when the listing has no company.',
  'Rules:',
  '- When comparing, label the owner\'s listings as OWN and name each competitor company, so it is clear which is "us" and which is "them".',
  '- Cite every listing you rely on by its exact name, and give the capture date (captured_at) of the snapshot you used, e.g. "Desert Safari (captured 2026-10-30)".',
  '- When the data needed to answer is missing, empty or null, say so plainly and name what is missing.',
  '- Never guess, estimate or invent prices, dates, ratings, reviews or timing. If you cannot tell from the data, say you cannot tell.',
  '- Prices are per person. Mention the traveler count and price date when they are given.',
  '- Keep the answer short and practical.',
  'Reply as JSON: "answer" is your answer as plain text; "listing_ids_used" lists the listing_id of every listing you relied on.',
].join('\n')

// ---------- types ----------

export type AskRequest = { question: string; tag_ids: string[] }

export type AskSource = {
  listing_id: string
  name: string
  snapshot_id: string | null
  captured_at: string | null
}

export type AskResponse = {
  suggestion_id: string | null
  answer: string
  model: string
  listing_ids: string[]
  snapshot_ids: string[]
  sources: AskSource[]
  saved: boolean
  save_error?: string
}

type Tag = { id: string; kind: string; name: string }
type ListingRow = {
  id: string
  name: string
  is_own: boolean
  source?: string | null
  active?: boolean | null
  company_id?: string | null
}
type CompanyRow = { id: string; name: string; is_own: boolean }
type SnapshotRow = { id: string; listing_id: string; captured_at: string | null } & Record<string, unknown>
type OptionRow = {
  snapshot_id: string
  sort_order: number
  name: string
  description: string | null
  price_per_person: number | null
  travelers: number | null
  price_date: string | null
}
type Row = Record<string, unknown>

export type Deps = {
  /** Reads an environment variable or secret. */
  env: (name: string) => string | undefined
  fetch: typeof fetch
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// ---------- request checks ----------

/** True only for the AQUILA owner. */
export function isOwner(userId: string | null | undefined): boolean {
  return userId === OWNER_USER_ID
}

/** Validates the JSON body. Tag kinds are checked later, against mt_tags. */
export function parseAskRequest(body: unknown): AskRequest {
  const b = (body ?? {}) as Partial<Record<keyof AskRequest, unknown>>
  const question = typeof b.question === 'string' ? b.question.trim() : ''
  if (!question) throw new HttpError(400, 'Type a question.')
  if (question.length > MAX_QUESTION) throw new HttpError(400, `Keep the question under ${MAX_QUESTION} characters.`)
  if (!Array.isArray(b.tag_ids) || !b.tag_ids.every((t) => typeof t === 'string' && t)) {
    throw new HttpError(400, 'tag_ids must be a list of tag ids.')
  }
  const tag_ids = [...new Set(b.tag_ids as string[])]
  if (tag_ids.length > MAX_TAGS) throw new HttpError(400, `Choose at most ${MAX_TAGS} tags.`)
  return { question, tag_ids }
}

// ---------- building the data ----------

export type ListingContext = {
  listing_id: string
  name: string
  ownership: 'own' | 'competitor'
  /** The listing's company, and whether it is our own (OWN). null when it has no company. */
  company: { name: string; own: boolean } | null
  tags: { kind: string; name: string }[]
  latest_snapshot: (Row & { snapshot_id: string; captured_at: string | null; options: Omit<OptionRow, 'snapshot_id'>[] }) | null
  timing_rules: Row[]
  reviews: { stars: unknown; text: unknown }[]
}

export type AskContext = {
  chosen_tags: { places: string[]; types: string[] }
  groups: { place_tag: string; listings: ListingContext[] }[]
}

/**
 * Listings that carry at least one chosen place tag and, when type tags were chosen,
 * at least one of those types.
 */
export function matchListingIds(links: { listing_id: string; tag_id: string }[], placeIds: string[], typeIds: string[]): string[] {
  const byListing = new Map<string, Set<string>>()
  for (const l of links) {
    const set = byListing.get(l.listing_id) ?? new Set<string>()
    set.add(l.tag_id)
    byListing.set(l.listing_id, set)
  }
  const out: string[] = []
  for (const [listingId, ids] of byListing) {
    const place = placeIds.some((id) => ids.has(id))
    const type = typeIds.length === 0 || typeIds.some((id) => ids.has(id))
    if (place && type) out.push(listingId)
  }
  return out.sort()
}

/** Puts the data together, grouped by chosen place tag. Reviews keep only stars and text. */
export function buildContext(input: {
  tags: Tag[]
  links: { listing_id: string; tag_id: string }[]
  placeIds: string[]
  typeIds: string[]
  listings: ListingRow[]
  /** Companies of the listings. Optional so older callers still work; missing means no company. */
  companies?: CompanyRow[]
  snapshots: SnapshotRow[]
  options: OptionRow[]
  timingRules: Row[]
  reviews: Row[]
}): AskContext {
  const tagById = new Map(input.tags.map((t) => [t.id, t]))
  const companyById = new Map((input.companies ?? []).map((c) => [c.id, c]))
  const name = (id: string) => tagById.get(id)?.name ?? id

  // Snapshots arrive newest first; keep the first one per listing.
  const latest = new Map<string, SnapshotRow>()
  for (const s of input.snapshots) if (!latest.has(s.listing_id)) latest.set(s.listing_id, s)

  const optionsBySnapshot = new Map<string, Omit<OptionRow, 'snapshot_id'>[]>()
  for (const { snapshot_id, ...o } of [...input.options].sort((a, b) => a.sort_order - b.sort_order)) {
    optionsBySnapshot.set(snapshot_id, [...(optionsBySnapshot.get(snapshot_id) ?? []), o])
  }

  const companyOf = (l: ListingRow): ListingContext['company'] => {
    const c = l.company_id ? companyById.get(l.company_id) : undefined
    return c ? { name: c.name, own: c.is_own === true } : null
  }

  const contextFor = (l: ListingRow): ListingContext => {
    const snap = latest.get(l.id)
    let latest_snapshot: ListingContext['latest_snapshot'] = null
    if (snap) {
      const { id, listing_id: _listing, ...fields } = snap
      latest_snapshot = { snapshot_id: id, ...fields, captured_at: snap.captured_at ?? null, options: optionsBySnapshot.get(id) ?? [] }
    }
    return {
      listing_id: l.id,
      name: l.name,
      ownership: l.is_own ? 'own' : 'competitor',
      company: companyOf(l),
      tags: input.links
        .filter((k) => k.listing_id === l.id && tagById.has(k.tag_id))
        .map((k) => ({ kind: tagById.get(k.tag_id)!.kind, name: tagById.get(k.tag_id)!.name })),
      latest_snapshot,
      timing_rules: input.timingRules
        .filter((r) => r.listing_id === l.id)
        .map(({ id: _id, listing_id: _l, ...rest }) => rest),
      reviews: input.reviews
        .filter((r) => r.listing_id === l.id)
        .map((r) => ({ stars: r.star_rating ?? null, text: r.review_text ?? null })),
    }
  }

  const tagsOf = (listingId: string) => new Set(input.links.filter((k) => k.listing_id === listingId).map((k) => k.tag_id))
  const listings = [...input.listings].sort((a, b) => a.name.localeCompare(b.name))
  return {
    chosen_tags: { places: input.placeIds.map(name), types: input.typeIds.map(name) },
    groups: input.placeIds.map((placeId) => ({
      place_tag: name(placeId),
      listings: listings.filter((l) => tagsOf(l.id).has(placeId)).map(contextFor),
    })),
  }
}

// ---------- the handler ----------

/** Builds the request handler. Tests call this with a fake fetch and env. */
export function createHandler(deps: Deps) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (req.method !== 'POST') return json(405, { error: 'Use POST.' })

    try {
      const supabaseUrl = deps.env('SUPABASE_URL')
      const anonKey = deps.env('SUPABASE_ANON_KEY')
      if (!supabaseUrl || !anonKey) throw new HttpError(500, 'The function is missing its Supabase settings.')

      const auth = req.headers.get('Authorization') ?? ''
      const jwt = auth.replace(/^Bearer\s+/i, '').trim()
      if (!jwt || jwt === auth) throw new HttpError(401, 'Sign in first.')

      // Every database call uses the caller's own token, so row-level security applies.
      const headers = { apikey: anonKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }

      const userRes = await deps.fetch(`${supabaseUrl}/auth/v1/user`, { headers })
      if (!userRes.ok) throw new HttpError(401, 'Your sign-in is not valid. Sign in again.')
      const user = (await userRes.json()) as { id?: string }
      if (!isOwner(user.id)) throw new HttpError(403, 'Only the AQUILA owner can use Ask AI.')

      let body: unknown
      try {
        body = await req.json()
      } catch {
        throw new HttpError(400, 'Send the question as JSON.')
      }
      const request = parseAskRequest(body)

      const read = async <T>(table: ReadTable, params: Record<string, string>): Promise<T[]> => {
        const res = await deps.fetch(`${supabaseUrl}/rest/v1/${table}?${new URLSearchParams(params)}`, { headers })
        if (!res.ok) throw new HttpError(502, `Could not read ${table}: ${(await res.text()).slice(0, 300)}`)
        return (await res.json()) as T[]
      }
      const inList = (ids: string[]) => `in.(${ids.join(',')})`

      // Tags decide which chosen ids are places and which are types.
      const tags = await read<Tag>('mt_tags', { select: 'id,kind,name' })
      const known = new Map(tags.map((t) => [t.id, t]))
      const placeIds = request.tag_ids.filter((id) => known.get(id)?.kind === 'place')
      const typeIds = request.tag_ids.filter((id) => known.get(id)?.kind === 'type')
      if (placeIds.length === 0) throw new HttpError(400, 'Choose at least one place tag.')

      const links = await read<{ listing_id: string; tag_id: string }>('mt_listing_tags', { select: 'listing_id,tag_id' })
      const ids = matchListingIds(links, placeIds, typeIds)
      const tagIds = [...placeIds, ...typeIds]

      const save = async (row: { answer: string | null; status: 'ok' | 'error'; listing_ids: string[]; snapshot_ids: string[] }) => {
        const res = await deps.fetch(`${supabaseUrl}/rest/v1/${SUGGESTIONS_TABLE}`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({ question: request.question, tag_ids: tagIds, model: GEMINI_MODEL, ...row }),
        })
        if (!res.ok) return { id: null, error: (await res.text()).slice(0, 300) || `status ${res.status}` }
        const rows = (await res.json()) as { id?: string }[]
        return { id: rows[0]?.id ?? null, error: null }
      }

      const respond = async (answer: string, sources: AskSource[]) => {
        const listing_ids = sources.map((s) => s.listing_id)
        const snapshot_ids = sources.map((s) => s.snapshot_id).filter((s): s is string => !!s)
        const saved = await save({ answer, status: 'ok', listing_ids, snapshot_ids })
        const out: AskResponse = {
          suggestion_id: saved.id,
          answer,
          model: GEMINI_MODEL,
          listing_ids,
          snapshot_ids,
          sources,
          saved: saved.error === null,
          ...(saved.error ? { save_error: saved.error } : {}),
        }
        return json(200, out)
      }

      if (ids.length === 0) {
        return respond('None of your listings carry the chosen tags, so there is no data to answer from.', [])
      }

      const [listings, snapshots, timingRules, reviews] = await Promise.all([
        read<ListingRow>('mt_listings', { select: 'id,name,is_own,source,active,company_id', id: inList(ids) }),
        read<SnapshotRow>('mt_snapshots', { select: SNAPSHOT_COLUMNS, listing_id: inList(ids), order: 'captured_at.desc' }),
        read<Row>('mt_timing_rules', { select: '*', listing_id: inList(ids) }),
        read<Row>('mt_reviews', { select: 'listing_id,star_rating,review_text', listing_id: inList(ids) }),
      ])
      // Snapshots arrive newest first, so the first one seen per listing is its latest.
      const firstPerListing = new Map<string, string>()
      for (const s of snapshots) if (!firstPerListing.has(s.listing_id)) firstPerListing.set(s.listing_id, s.id)
      const latestSnapshotIds = [...firstPerListing.values()]
      const options = latestSnapshotIds.length
        ? await read<OptionRow>('mt_snapshot_options', {
          select: 'snapshot_id,sort_order,name,description,price_per_person,travelers,price_date',
          snapshot_id: inList(latestSnapshotIds),
          order: 'sort_order.asc',
        })
        : []

      // Only the companies of the chosen listings, and only their name and OWN marker.
      const companyIds = [...new Set(listings.map((l) => l.company_id).filter((c): c is string => !!c))]
      const companies = companyIds.length
        ? await read<CompanyRow>('mt_companies', { select: 'id,name,is_own', id: inList(companyIds) })
        : []

      const context = buildContext({ tags, links, placeIds, typeIds, listings, companies, snapshots, options, timingRules, reviews })

      const key = deps.env('AQUILA_GEMINI_KEY')
      if (!key) throw new HttpError(500, 'The AQUILA_GEMINI_KEY secret is not set.')

      let answer: string
      let cited: string[]
      try {
        ({ answer, cited } = await askGemini(deps.fetch, key, request.question, context))
      } catch (err) {
        await save({ answer: null, status: 'error', listing_ids: ids, snapshot_ids: latestSnapshotIds })
        throw err
      }

      // Keep only ids that were really sent; if the model named none, report every listing it was given.
      const used = ids.filter((id) => cited.includes(id))
      const sourceIds = used.length ? used : ids
      const listingById = new Map(listings.map((l) => [l.id, l]))
      const sources: AskSource[] = sourceIds
        .filter((id) => listingById.has(id))
        .map((id) => {
          const snapId = firstPerListing.get(id) ?? null
          const snap = snapId ? snapshots.find((s) => s.id === snapId) : undefined
          return { listing_id: id, name: listingById.get(id)!.name, snapshot_id: snapId, captured_at: snap?.captured_at ?? null }
        })
      return respond(answer, sources)
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message })
      return json(500, { error: 'Something went wrong in Ask AI.' })
    }
  }
}

/** Calls Gemini and returns its answer and the listing ids it says it used. */
export async function askGemini(
  doFetch: typeof fetch,
  key: string,
  question: string,
  context: AskContext,
): Promise<{ answer: string; cited: string[] }> {
  const res = await doFetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: `Question: ${question}\n\nData (JSON):\n${JSON.stringify(context)}` }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            answer: { type: 'STRING' },
            listing_ids_used: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['answer', 'listing_ids_used'],
        },
      },
    }),
  })
  // Gemini's error text is not passed on: only the status, so nothing about the request leaks.
  if (!res.ok) throw new HttpError(502, `The AI request failed (status ${res.status}).`)
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  let parsed: { answer?: unknown; listing_ids_used?: unknown }
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new HttpError(502, 'The AI reply could not be read.')
  }
  if (typeof parsed.answer !== 'string' || !parsed.answer.trim()) throw new HttpError(502, 'The AI gave no answer.')
  const cited = Array.isArray(parsed.listing_ids_used) ? parsed.listing_ids_used.filter((x): x is string => typeof x === 'string') : []
  return { answer: parsed.answer.trim(), cited }
}

// ---------- Deno entry point ----------

// Declared here, not globally, so the app's TypeScript build can check this file too.
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): unknown
}

if (typeof Deno !== 'undefined') {
  Deno.serve(createHandler({ env: (name) => Deno.env.get(name), fetch }))
}
