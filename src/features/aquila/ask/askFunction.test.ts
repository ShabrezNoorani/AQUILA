// Tests the aquila-ask Edge Function's code with a fake fetch and fake secrets.
// This checks the function's logic only. It does not run it on Supabase's Deno runtime,
// reach the real database or row-level security, or call the real Gemini API.

import { beforeEach, describe, expect, it } from 'vitest'
import {
  GEMINI_MODEL,
  OWNER_USER_ID,
  READ_TABLES,
  SYSTEM_PROMPT,
  buildContext,
  createHandler,
  isOwner,
  matchListingIds,
  parseAskRequest,
} from '../../../../supabase/functions/aquila-ask/index.ts'
import { OWNER_USER_ID as APP_OWNER } from '../../../lib/owner'

const SUPABASE_URL = 'https://proj.supabase.co'
const SECRET = 'gemini-secret-key-123'
const env: Record<string, string> = { SUPABASE_URL, SUPABASE_ANON_KEY: 'anon-key', AQUILA_GEMINI_KEY: SECRET }

type Call = { url: URL; init: RequestInit }
let calls: Call[]
let userId: string
let geminiReply: { status: number; body: unknown }
let saveStatus: number
let tables: Record<string, unknown[]>

const tags = [
  { id: 'P1', kind: 'place', name: 'Dubai' },
  { id: 'P2', kind: 'place', name: 'Abu Dhabi' },
  { id: 'T1', kind: 'type', name: 'Safari' },
  { id: 'T2', kind: 'type', name: 'Cruise' },
]

function reply(status: number, body: unknown) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
}

async function fakeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input))
  calls.push({ url, init })
  if (url.host === 'generativelanguage.googleapis.com') return reply(geminiReply.status, geminiReply.body)
  if (url.pathname === '/auth/v1/user') return userId ? reply(200, { id: userId }) : reply(401, { msg: 'bad jwt' })
  const table = url.pathname.replace('/rest/v1/', '')
  if (table === 'mt_suggestions') return saveStatus === 201 ? reply(201, [{ id: 'SUG1' }]) : reply(saveStatus, 'permission denied')
  return reply(200, tables[table] ?? [])
}

const handler = () => createHandler({ env: (n) => env[n], fetch: fakeFetch as typeof fetch })

function post(body: unknown, token: string | null = 'user-jwt') {
  return new Request('https://fn.local/aquila-ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

const geminiCalls = () => calls.filter((c) => c.url.host === 'generativelanguage.googleapis.com')
const restTables = () => calls.filter((c) => c.url.pathname.startsWith('/rest/v1/')).map((c) => c.url.pathname.replace('/rest/v1/', ''))
const saved = () => calls.filter((c) => c.url.pathname === '/rest/v1/mt_suggestions').map((c) => JSON.parse(String(c.init.body)))
const sentToGemini = () => JSON.parse(String(geminiCalls()[0].init.body))
/** Every listing sent, across all company groups. */
const allListings = () => sentContext().companies.flatMap((g: { listings: unknown[] }) => g.listings)
const sentContext = () => {
  const text: string = sentToGemini().contents[0].parts[0].text
  return JSON.parse(text.slice(text.indexOf('{')))
}

beforeEach(() => {
  calls = []
  userId = OWNER_USER_ID
  saveStatus = 201
  geminiReply = {
    status: 200,
    body: { candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'Rival Safari (captured 2026-10-30) charges 95.2 per person.', listing_ids_used: ['L2', 'ghost'] }) }] } }] },
  }
  tables = {
    mt_tags: tags,
    mt_listing_tags: [
      { listing_id: 'L1', tag_id: 'P1' }, { listing_id: 'L1', tag_id: 'T1' },
      { listing_id: 'L2', tag_id: 'P1' }, { listing_id: 'L2', tag_id: 'T1' },
      { listing_id: 'L3', tag_id: 'P1' }, { listing_id: 'L3', tag_id: 'T2' },
      { listing_id: 'L4', tag_id: 'P2' }, { listing_id: 'L4', tag_id: 'T1' },
    ],
    mt_listings: [
      { id: 'L1', name: 'Our Safari', is_own: true, source: 'viator', active: true, company_id: 'C1' },
      { id: 'L2', name: 'Rival Safari', is_own: false, source: 'viator', active: true, company_id: 'C2' },
    ],
    mt_companies: [
      { id: 'C1', name: 'Scenic Zest Tours', is_own: true },
      { id: 'C2', name: 'Rival Co', is_own: false },
    ],
    mt_snapshots: [
      { id: 'S2new', listing_id: 'L2', captured_at: '2026-10-30T10:00:00Z', title: 'Rival', rating: 4.6 },
      { id: 'S1', listing_id: 'L1', captured_at: '2026-10-29T10:00:00Z', title: 'Ours', rating: 4.8 },
      { id: 'S2old', listing_id: 'L2', captured_at: '2026-09-01T10:00:00Z', title: 'Rival old', rating: 4.1 },
    ],
    mt_snapshot_options: [
      { snapshot_id: 'S2new', sort_order: 1, name: 'Private', description: null, price_per_person: 300, travelers: null, price_date: null },
      { snapshot_id: 'S2new', sort_order: 0, name: 'Shared', description: 'Priced for 2 travelers, Nov 25', price_per_person: 95.2, travelers: 2, price_date: '2026-11-25' },
    ],
    mt_timing_rules: [{ id: 'R1', listing_id: 'L2', rule: 'Sunset departures only', created_at: '2026-10-01' }],
    mt_reviews: [{ listing_id: 'L2', star_rating: 2, review_text: 'Late pickup' }],
  }
})

describe('owner check', () => {
  it('uses the same owner id as the app', () => {
    expect(OWNER_USER_ID).toBe(APP_OWNER)
    expect(isOwner(OWNER_USER_ID)).toBe(true)
    expect(isOwner('someone-else')).toBe(false)
    expect(isOwner(null)).toBe(false)
    expect(isOwner(undefined)).toBe(false)
  })

  it('refuses any other signed-in user with 403, reading no data and not calling Gemini', async () => {
    userId = 'f00dbabe-0000-0000-0000-000000000000'
    const res = await handler()(post({ question: 'Prices?', tag_ids: ['P1'] }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/only the aquila owner/i)
    expect(restTables()).toEqual([])
    expect(geminiCalls()).toHaveLength(0)
  })

  it('refuses a missing or invalid login with 401', async () => {
    expect((await handler()(post({ question: 'x', tag_ids: ['P1'] }, null))).status).toBe(401)
    userId = ''
    expect((await handler()(post({ question: 'x', tag_ids: ['P1'] }))).status).toBe(401)
    expect(restTables()).toEqual([])
    expect(geminiCalls()).toHaveLength(0)
  })

  it("checks the user and reads data with the caller's own token, not a service key", async () => {
    await handler()(post({ question: 'Prices?', tag_ids: ['P1'] }))
    const dbCalls = calls.filter((c) => c.url.host === 'proj.supabase.co')
    expect(dbCalls.length).toBeGreaterThan(3)
    for (const c of dbCalls) {
      const h = c.init.headers as Record<string, string>
      expect(h.Authorization).toBe('Bearer user-jwt')
      expect(h.apikey).toBe('anon-key')
    }
  })
})

describe('request checks', () => {
  it('needs a question and a list of tag ids', () => {
    expect(() => parseAskRequest({ question: '  ', tag_ids: ['P1'] })).toThrow(/type a question/i)
    expect(() => parseAskRequest({ question: 'Hi', tag_ids: 'P1' })).toThrow(/tag_ids/)
    expect(parseAskRequest({ question: ' Hi ', tag_ids: ['P1', 'P1', 'T1'] })).toEqual({ question: 'Hi', tag_ids: ['P1', 'T1'] })
  })

  it('accepts type tags alone, with no place tag', async () => {
    const res = await handler()(post({ question: 'Prices?', tag_ids: ['T1'] }))
    expect(res.status).toBe(200)
    expect(geminiCalls()).toHaveLength(1)
  })

  it('answers 400 when every chosen tag has been deleted, instead of widening to all listings', async () => {
    const res = await handler()(post({ question: 'Prices?', tag_ids: ['gone'] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no longer exist/i)
    expect(geminiCalls()).toHaveLength(0)
  })

  it('rejects other methods and answers the browser pre-flight', async () => {
    expect((await handler()(new Request('https://fn.local', { method: 'GET' }))).status).toBe(405)
    const pre = await handler()(new Request('https://fn.local', { method: 'OPTIONS' }))
    expect(pre.status).toBe(200)
    expect(pre.headers.get('Access-Control-Allow-Headers')).toMatch(/authorization/)
  })
})

describe('choosing listings by tag', () => {
  const links = [
    { listing_id: 'A', tag_id: 'P1' }, { listing_id: 'A', tag_id: 'T1' },
    { listing_id: 'B', tag_id: 'P2' }, { listing_id: 'B', tag_id: 'T2' },
    { listing_id: 'C', tag_id: 'T1' },
  ]
  it('keeps listings that carry ALL the chosen tags, of any kinds', () => {
    expect(matchListingIds(links, ['P1'])).toEqual(['A'])
    expect(matchListingIds(links, ['T1'])).toEqual(['A', 'C'])
    expect(matchListingIds(links, ['P1', 'T1'])).toEqual(['A'])
    expect(matchListingIds(links, ['P1', 'P2'])).toEqual([])
    expect(matchListingIds(links, [])).toEqual([])
  })
})

describe('a full answer', () => {
  it('reads only the allowed tables and writes only mt_suggestions', async () => {
    const res = await handler()(post({ question: 'Prices?', tag_ids: ['P1', 'T1'] }))
    expect(res.status).toBe(200)
    for (const t of restTables()) expect([...READ_TABLES, 'mt_suggestions']).toContain(t)
    expect(new Set(restTables())).toEqual(new Set([...READ_TABLES, 'mt_suggestions']))
    const writes = calls.filter((c) => c.init.method === 'POST' && c.url.host === 'proj.supabase.co')
    expect(writes.map((c) => c.url.pathname)).toEqual(['/rest/v1/mt_suggestions'])
  })

  it('never asks for raw page HTML or text', async () => {
    await handler()(post({ question: 'Prices?', tag_ids: ['P1'] }))
    const snap = calls.find((c) => c.url.pathname === '/rest/v1/mt_snapshots')!
    expect(snap.url.searchParams.get('select')).not.toMatch(/raw_html|raw_text/)
    expect(snap.url.searchParams.get('order')).toBe('captured_at.desc')
  })

  it('calls Gemini with the one model constant and the key from the secret, in a header', async () => {
    await handler()(post({ question: 'Prices?', tag_ids: ['P1', 'T1'] }))
    expect(GEMINI_MODEL).toBe('gemini-flash-lite-latest')
    const [g] = geminiCalls()
    expect(g.url.pathname).toBe(`/v1beta/models/${GEMINI_MODEL}:generateContent`)
    expect((g.init.headers as Record<string, string>)['x-goog-api-key']).toBe(SECRET)
    expect(g.url.search).not.toContain(SECRET)
  })

  it('tells the model to cite names and capture dates, say what is missing, and never guess', async () => {
    await handler()(post({ question: 'Prices?', tag_ids: ['P1'] }))
    const prompt = sentToGemini().systemInstruction.parts[0].text
    expect(prompt).toBe(SYSTEM_PROMPT)
    expect(prompt).toMatch(/exact name/i)
    expect(prompt).toMatch(/capture date/i)
    expect(prompt).toMatch(/missing/i)
    expect(prompt).toMatch(/never guess/i)
  })

  it('sends the data grouped by company, with all tags and kinds, ownership, latest snapshot, options, timing rules and nameless reviews', async () => {
    await handler()(post({ question: 'Prices?', tag_ids: ['P1', 'T1'] }))
    const ctx = sentContext()
    expect(ctx.chosen_tags).toEqual([{ kind: 'place', name: 'Dubai' }, { kind: 'type', name: 'Safari' }])
    expect(ctx.companies.map((g: { company: string; own: boolean }) => [g.company, g.own])).toEqual([
      ['Scenic Zest Tours', true], ['Rival Co', false],
    ])
    const rival = allListings().find((l: { name: string }) => l.name === 'Rival Safari')
    expect(rival.ownership).toBe('competitor')
    expect(rival.tags).toEqual([{ kind: 'place', name: 'Dubai' }, { kind: 'type', name: 'Safari' }])
    expect(rival.latest_snapshot.snapshot_id).toBe('S2new')
    expect(rival.latest_snapshot.captured_at).toBe('2026-10-30T10:00:00Z')
    expect(rival.latest_snapshot.options.map((o: { name: string }) => o.name)).toEqual(['Shared', 'Private'])
    expect(rival.latest_snapshot.options[0]).toMatchObject({ travelers: 2, price_date: '2026-11-25', price_per_person: 95.2 })
    expect(rival.timing_rules).toEqual([{ rule: 'Sunset departures only', created_at: '2026-10-01' }])
    expect(rival.reviews).toEqual([{ stars: 2, text: 'Late pickup' }])
    const ours = allListings().find((l: { name: string }) => l.name === 'Our Safari')
    expect(ours.ownership).toBe('own')
    expect(ours.reviews).toEqual([])
  })

  it("sends each listing's company name and OWN marker, and nothing else about the company", async () => {
    await handler()(post({ question: 'How do we compare?', tag_ids: ['P1', 'T1'] }))
    const read = calls.find((c) => c.url.pathname === '/rest/v1/mt_companies')!
    expect(read.url.searchParams.get('select')).toBe('id,name,is_own')
    expect(read.url.searchParams.get('id')).toBe('in.(C1,C2)')
    const byName = Object.fromEntries(
      allListings().map((l: { name: string; company: unknown }) => [l.name, l.company]),
    )
    expect(byName).toEqual({
      'Our Safari': { name: 'Scenic Zest Tours', own: true },
      'Rival Safari': { name: 'Rival Co', own: false },
    })
  })

  it('labels the OWN company in the prompt so answers compare us with competitors', () => {
    expect(SYSTEM_PROMPT).toMatch(/"own": true when it is the owner's own company \(OWN\)/)
    expect(SYSTEM_PROMPT).toMatch(/label the owner's listings as OWN and name each competitor company/i)
  })

  it('does not read mt_companies when no chosen listing has a company', async () => {
    tables.mt_listings = (tables.mt_listings as Record<string, unknown>[]).map(({ company_id: _c, ...l }) => l)
    await handler()(post({ question: 'Prices?', tag_ids: ['P1', 'T1'] }))
    expect(restTables()).not.toContain('mt_companies')
    for (const l of allListings()) expect(l.company).toBeNull()
    expect(sentContext().companies).toHaveLength(1)
    expect(sentContext().companies[0].company).toBeNull()
  })

  it('returns the answer with the listing and snapshot ids it used, ignoring ids it was not given', async () => {
    const res = await handler()(post({ question: 'Prices?', tag_ids: ['P1', 'T1'] }))
    const body = await res.json()
    expect(body).toMatchObject({
      suggestion_id: 'SUG1',
      answer: 'Rival Safari (captured 2026-10-30) charges 95.2 per person.',
      model: GEMINI_MODEL,
      listing_ids: ['L2'],
      snapshot_ids: ['S2new'],
      sources: [{ listing_id: 'L2', name: 'Rival Safari', snapshot_id: 'S2new', captured_at: '2026-10-30T10:00:00Z' }],
      saved: true,
    })
    expect(JSON.stringify(body)).not.toContain(SECRET)
  })

  it('saves one mt_suggestions row with the tags together, the model, and status ok', async () => {
    await handler()(post({ question: '  Prices?  ', tag_ids: ['T1', 'P1'] }))
    expect(saved()).toEqual([{
      question: 'Prices?',
      tag_ids: ['T1', 'P1'],
      model: GEMINI_MODEL,
      answer: 'Rival Safari (captured 2026-10-30) charges 95.2 per person.',
      status: 'ok',
      listing_ids: ['L2'],
      snapshot_ids: ['S2new'],
    }])
  })

  it('still returns the answer, marked unsaved, when the save fails', async () => {
    saveStatus = 403
    const body = await (await handler()(post({ question: 'Prices?', tag_ids: ['P1'] }))).json()
    expect(body.saved).toBe(false)
    expect(body.save_error).toMatch(/permission denied/)
    expect(body.answer).toMatch(/Rival Safari/)
  })

  it('answers without calling Gemini when no listing has the tags, and still saves the row', async () => {
    const res = await handler()(post({ question: 'Prices?', tag_ids: ['P2', 'T2'] }))
    const body = await res.json()
    expect(body.answer).toMatch(/none of your listings carry all the chosen tags/i)
    expect(body.listing_ids).toEqual([])
    expect(geminiCalls()).toHaveLength(0)
    expect(saved()).toHaveLength(1)
    expect(saved()[0]).toMatchObject({ model: GEMINI_MODEL, status: 'ok', tag_ids: ['P2', 'T2'] })
  })
})

describe('when Gemini fails', () => {
  it('answers 502 without passing on Gemini’s error text, and saves a row with status error and the model', async () => {
    geminiReply = { status: 500, body: { error: { message: `quota exceeded for key ${SECRET}` } } }
    const res = await handler()(post({ question: 'Prices?', tag_ids: ['P1'] }))
    expect(res.status).toBe(502)
    const text = await res.text()
    expect(text).toMatch(/status 500/)
    expect(text).not.toContain(SECRET)
    expect(saved()).toEqual([expect.objectContaining({ status: 'error', answer: null, model: GEMINI_MODEL })])
  })

  it('treats an unreadable reply as a failure', async () => {
    geminiReply = { status: 200, body: { candidates: [{ content: { parts: [{ text: 'not json' }] } }] } }
    const res = await handler()(post({ question: 'Prices?', tag_ids: ['P1'] }))
    expect(res.status).toBe(502)
    expect(saved()[0].status).toBe('error')
  })

  it('answers 500 when the AQUILA_GEMINI_KEY secret is not set', async () => {
    delete env.AQUILA_GEMINI_KEY
    try {
      const res = await handler()(post({ question: 'Prices?', tag_ids: ['P1'] }))
      expect(res.status).toBe(500)
      expect((await res.json()).error).toMatch(/AQUILA_GEMINI_KEY/)
      expect(geminiCalls()).toHaveLength(0)
    } finally {
      env.AQUILA_GEMINI_KEY = SECRET
    }
  })
})

describe('asking with no tags, about companies', () => {
  it('uses every listing when no tag is chosen, and the prompt tells the model to compare company groups', async () => {
    const res = await handler()(post({ question: 'Which competitor tour has the best reviews?', tag_ids: [] }))
    expect(res.status).toBe(200)
    const read = calls.find((c) => c.url.pathname === '/rest/v1/mt_listings' && c.url.searchParams.get('select') === 'id')
    expect(read).toBeTruthy()
    const ctx = sentContext()
    expect(ctx.chosen_tags).toEqual([])
    // Each company is its own group, OWN first; the competitor group carries its listings' reviews.
    const rival = ctx.companies.find((g: { company: string }) => g.company === 'Rival Co')
    expect(rival.own).toBe(false)
    expect(rival.listings.map((l: { reviews: unknown }) => l.reviews)).toEqual([[{ stars: 2, text: 'Late pickup' }]])
    expect(ctx.companies[0]).toMatchObject({ company: 'Scenic Zest Tours', own: true })
    expect(SYSTEM_PROMPT).toMatch(/grouped by company/i)
    expect(SYSTEM_PROMPT).toMatch(/which competitor tour has the best reviews\?/i)
    expect(SYSTEM_PROMPT).toMatch(/compare the company groups/i)
    expect(saved()[0].tag_ids).toEqual([])
  })
})

describe('buildContext', () => {
  const base = { snapshots: [], options: [], timingRules: [], reviews: [] }

  it('sends every tag of a listing, of every kind, not only the chosen ones', () => {
    const allTags = [...tags, { id: 'F1', kind: 'food', name: 'Bakery' }]
    const ctx = buildContext({
      ...base,
      tags: allTags,
      links: [{ listing_id: 'X', tag_id: 'P1' }, { listing_id: 'X', tag_id: 'T1' }, { listing_id: 'X', tag_id: 'F1' }],
      chosenIds: ['P1'],
      listings: [{ id: 'X', name: 'Mixed', is_own: false }],
    })
    expect(ctx.chosen_tags).toEqual([{ kind: 'place', name: 'Dubai' }])
    expect(ctx.companies[0].listings[0].tags).toEqual([
      { kind: 'place', name: 'Dubai' }, { kind: 'type', name: 'Safari' }, { kind: 'food', name: 'Bakery' },
    ])
    expect(ctx.companies[0].listings[0].latest_snapshot).toBeNull()
  })

  it('groups listings by company: OWN first, then competitors by name, then Unassigned', () => {
    const ctx = buildContext({
      ...base,
      tags,
      links: [],
      chosenIds: [],
      listings: [
        { id: 'A', name: 'Ours one', is_own: true, company_id: 'OWN1' },
        { id: 'E', name: 'Zed walk', is_own: false, company_id: 'R2' },
        { id: 'B', name: 'Ours two', is_own: true, company_id: 'OWN1' },
        { id: 'C', name: 'Theirs', is_own: false, company_id: 'R1' },
        { id: 'D', name: 'Nobody', is_own: false, company_id: null },
      ],
      companies: [
        { id: 'OWN1', name: 'Scenic Zest Tours', is_own: true },
        { id: 'R1', name: 'Rival Co', is_own: false },
        { id: 'R2', name: 'Apex Tours', is_own: false },
      ],
    })
    expect(ctx.companies.map((g) => [g.company, g.own, g.listings.map((l) => l.name)])).toEqual([
      ['Scenic Zest Tours', true, ['Ours one', 'Ours two']],
      ['Apex Tours', false, ['Zed walk']],
      ['Rival Co', false, ['Theirs']],
      [null, false, ['Nobody']],
    ])
    expect(ctx.companies[0].listings[0].company).toEqual({ name: 'Scenic Zest Tours', own: true })
    expect(ctx.companies[3].listings[0].company).toBeNull()
  })

  it('takes OWN from the company, and treats a company id with no matching company as no company', () => {
    const ctx = buildContext({
      ...base,
      tags, links: [], chosenIds: [],
      listings: [
        { id: 'A', name: 'Ghost', is_own: false, company_id: 'gone' },
        { id: 'B', name: 'Ours', is_own: false, company_id: 'OWN1' },
      ],
      companies: [{ id: 'OWN1', name: 'Scenic Zest Tours', is_own: true }],
    })
    const byName = Object.fromEntries(ctx.companies.flatMap((g) => g.listings).map((l) => [l.name, [l.company, l.ownership]]))
    expect(byName).toEqual({
      Ghost: [null, 'competitor'],
      Ours: [{ name: 'Scenic Zest Tours', own: true }, 'own'],
    })
  })
})
