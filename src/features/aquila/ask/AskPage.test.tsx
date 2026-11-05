import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { callsOf, createFakeSupabase, type Query, type Result } from '../test/fakeSupabase'
import { supabase } from '../../../lib/supabase'
import AskPage from './AskPage'

vi.mock('../../../lib/supabase', () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
}))

let queries: Query[]
let suggestions: unknown[]
let invokeResult: { data: unknown; error: unknown }

const tags = [
  { id: 'P1', kind: 'place', name: 'Dubai' },
  { id: 'P2', kind: 'place', name: 'Abu Dhabi' },
  { id: 'T1', kind: 'type', name: 'Safari' },
]
const listings = [
  { id: 'L1', name: 'Our Safari', is_own: true, source: 'viator', active: true },
  { id: 'L2', name: 'Rival Safari', is_own: false, source: 'viator', active: true },
]

const links = [
  { listing_id: 'L1', tag_id: 'P1' }, { listing_id: 'L1', tag_id: 'T1' },
  { listing_id: 'L2', tag_id: 'P1' }, { listing_id: 'L2', tag_id: 'P2' }, { listing_id: 'L2', tag_id: 'T1' },
]

function respond(q: Query): Result {
  if (q.table === 'mt_tags') return { data: tags, error: null }
  if (q.table === 'mt_listings') return { data: listings, error: null }
  if (q.table === 'mt_listing_tags') return { data: links, error: null }
  if (q.table === 'mt_suggestions') return { data: suggestions, error: null }
  return { data: null, error: { message: `unexpected table ${q.table}` } }
}

const invoke = () => vi.mocked(supabase.functions.invoke)

beforeEach(() => {
  suggestions = []
  invokeResult = {
    data: {
      suggestion_id: 'SUG1',
      answer: 'Rival Safari (captured 2026-10-30) is cheaper.\nOur Safari has no price for 2 travelers.',
      model: 'gemini-flash-lite-latest',
      listing_ids: ['L2'],
      snapshot_ids: ['S2'],
      sources: [{ listing_id: 'L2', name: 'Rival Safari', snapshot_id: 'S2', captured_at: '2026-10-30T10:00:00Z' }],
      saved: true,
    },
    error: null,
  }
  const fake = createFakeSupabase((q) => respond(q))
  queries = fake.queries
  vi.mocked(supabase.from).mockImplementation(fake.client.from as never)
  invoke().mockReset()
  invoke().mockImplementation((() => Promise.resolve(invokeResult)) as never)
})

const ask = () => fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
/** Clicks a tag in the Ask page's tag picker, once it has loaded. */
const pick = async (name: string) => {
  const picker = await screen.findByRole('group', { name: 'Choose tags' })
  fireEvent.click(within(picker).getByRole('button', { name }))
}
const typeQuestion = (v: string) => fireEvent.change(screen.getByLabelText(/^question/i), { target: { value: v } })

describe('AskPage', () => {
  it('offers the tags listings use, one row per kind', async () => {
    render(<AskPage />)
    const picker = await screen.findByRole('group', { name: 'Choose tags' })
    const row = (kind: string) => within(within(picker).getByRole('group', { name: kind })).getAllByRole('button').map((b) => b.textContent)
    expect(row('Place')).toEqual(['Abu Dhabi', 'Dubai'])
    expect(row('Type')).toEqual(['Safari'])
  })

  it('needs only a question: no tags means every listing', async () => {
    render(<AskPage />)
    await screen.findByRole('group', { name: 'Choose tags' })
    ask()
    expect(await screen.findByText('Type a question.')).toBeTruthy()
    expect(invoke()).not.toHaveBeenCalled()
    typeQuestion('Which competitor tour has the best reviews?')
    ask()
    await waitFor(() => expect(invoke()).toHaveBeenCalledTimes(1))
    expect(invoke().mock.calls[0]).toEqual(['aquila-ask', {
      body: { question: 'Which competitor tour has the best reviews?', tag_ids: [] },
    }])
  })

  it('sends the chosen tags of any kinds together with the question to aquila-ask', async () => {
    render(<AskPage />)
    await pick('Abu Dhabi')
    await pick('Safari')
    typeQuestion('  Who is cheapest?  ')
    ask()
    await waitFor(() => expect(invoke()).toHaveBeenCalledTimes(1))
    expect(invoke().mock.calls[0]).toEqual(['aquila-ask', { body: { question: 'Who is cheapest?', tag_ids: ['P2', 'T1'] } }])
  })

  it('shows the answer with the listings and capture dates it used', async () => {
    render(<AskPage />)
    await pick('Dubai')
    typeQuestion('Who is cheapest?')
    ask()
    const answer = await screen.findByRole('region', { name: 'Answer' })
    expect(answer.textContent).toMatch(/Rival Safari \(captured 2026-10-30\) is cheaper/)
    const used = within(answer).getByRole('list', { name: 'Listings used' })
    const link = within(used).getByRole('link', { name: 'Rival Safari' })
    expect(link.getAttribute('href')).toBe('#/listings/L2')
    const shownDate = new Date('2026-10-30T10:00:00Z').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    expect(within(used).getByText(`captured ${shownDate}`)).toBeTruthy()
  })

  it("shows the function's error message and no answer when the call fails", async () => {
    invokeResult = {
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: new Response(JSON.stringify({ error: 'Only the AQUILA owner can use Ask AI.' }), { status: 403 }),
      }),
    }
    render(<AskPage />)
    await pick('Dubai')
    typeQuestion('Q')
    ask()
    expect(await screen.findByText('Could not get an answer: Only the AQUILA owner can use Ask AI.')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Answer' })).toBeNull()
  })

  it('says when an answer could not be saved to past answers', async () => {
    invokeResult = { data: { ...(invokeResult.data as object), saved: false, save_error: 'permission denied' }, error: null }
    render(<AskPage />)
    await pick('Dubai')
    typeQuestion('Q')
    ask()
    expect(await screen.findByText(/not saved to past answers: permission denied/i)).toBeTruthy()
  })

  it('shows past answers from mt_suggestions, newest first, with tags, status and listings', async () => {
    suggestions = [
      {
        id: 'A', created_at: '2026-11-01T09:00:00Z', question: 'Who is cheapest?', tag_ids: ['P1', 'T1'],
        listing_ids: ['L2', 'L9'], snapshot_ids: ['S2'], model: 'gemini-flash-lite-latest', answer: 'Rival Safari.', status: 'ok',
      },
      {
        id: 'B', created_at: '2026-10-31T09:00:00Z', question: 'Any reviews?', tag_ids: ['P2'],
        listing_ids: [], snapshot_ids: [], model: 'gemini-flash-lite-latest', answer: null, status: 'error',
      },
    ]
    render(<AskPage />)
    const first = await screen.findByRole('article', { name: 'Past answer: Who is cheapest?' })
    expect(within(first).getByText('Rival Safari.')).toBeTruthy()
    expect(within(first).getByText('Dubai')).toBeTruthy()
    expect(within(first).getByText('Safari')).toBeTruthy()
    expect(within(first).getByText('Answered')).toBeTruthy()
    await waitFor(() => expect(within(first).getByRole('link', { name: 'Rival Safari' })).toBeTruthy())
    expect(within(first).getByText('(deleted listing)')).toBeTruthy()

    const second = screen.getByRole('article', { name: 'Past answer: Any reviews?' })
    expect(within(second).getByText('Failed')).toBeTruthy()
    expect(within(second).getByText(/the AI call failed/i)).toBeTruthy()

    const q = queries.find((x) => x.table === 'mt_suggestions')!
    expect(callsOf(q, 'order')).toEqual([['created_at', { ascending: false }]])
  })

  it('reloads past answers after asking', async () => {
    render(<AskPage />)
    await pick('Dubai')
    typeQuestion('Q')
    ask()
    await screen.findByRole('region', { name: 'Answer' })
    await waitFor(() => expect(queries.filter((q) => q.table === 'mt_suggestions')).toHaveLength(2))
  })

  it('shows an empty state when there are no past answers', async () => {
    render(<AskPage />)
    expect(await screen.findByText('No past answers yet.')).toBeTruthy()
  })

  it('never writes to any table itself', async () => {
    render(<AskPage />)
    await pick('Dubai')
    typeQuestion('Q')
    ask()
    await screen.findByRole('region', { name: 'Answer' })
    expect(queries.filter((q) => ['insert', 'update', 'delete'].some((m) => callsOf(q, m).length))).toHaveLength(0)
  })
})
