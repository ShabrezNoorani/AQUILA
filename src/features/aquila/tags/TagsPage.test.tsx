import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { callsOf, createFakeSupabase, type Query, type Result } from '../test/fakeSupabase'
import { supabase } from '../../../lib/supabase'
import { createTag, deleteTag, fetchTags, setListingTags } from '../api'
import type { Tag } from '../types'
import TagsPage from './TagsPage'

vi.mock('../../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

const has = (q: Query, m: string) => callsOf(q, m).length > 0
const isCount = (q: Query) =>
  callsOf(q, 'select').some((args) => (args[1] as { head?: boolean } | undefined)?.head === true)

let queries: Query[]
let tags: Tag[]
let links: { listing_id: string; tag_id: string }[]
let usage: number

function respond(q: Query): Result {
  if (q.table === 'mt_tags' && has(q, 'insert')) {
    const row = callsOf(q, 'insert')[0][0] as Omit<Tag, 'id'>
    return { data: { id: 'NEW', ...row }, error: null }
  }
  if (q.table === 'mt_tags' && has(q, 'delete')) return { data: [{ id: 'x' }], error: null }
  if (q.table === 'mt_tags') return { data: tags, error: null }
  if (q.table === 'mt_listing_tags' && isCount(q)) return { data: null, error: null, count: usage }
  if (q.table === 'mt_listing_tags' && (has(q, 'insert') || has(q, 'delete'))) return { data: null, error: null }
  if (q.table === 'mt_listing_tags') return { data: links, error: null }
  return { data: null, error: { message: `unexpected table ${q.table}` } }
}

beforeEach(() => {
  tags = [
    { id: 'T1', name: 'Safari', kind: 'type' },
    { id: 'P1', name: 'Dubai', kind: 'place' },
  ]
  links = []
  usage = 0
  const fake = createFakeSupabase((q) => respond(q))
  queries = fake.queries
  vi.mocked(supabase.from).mockImplementation(fake.client.from as never)
})

const inserts = (table: string) => queries.filter((q) => q.table === table && has(q, 'insert'))

describe('createTag', () => {
  it('trims the name and inserts a new tag into mt_tags', async () => {
    const r = await createTag('  Desert Camp  ', 'type')
    expect(r.existed).toBe(false)
    expect(r.tag).toEqual({ id: 'NEW', name: 'Desert Camp', kind: 'type' })
    expect(inserts('mt_tags')).toHaveLength(1)
    expect(callsOf(inserts('mt_tags')[0], 'insert')[0][0]).toEqual({ name: 'Desert Camp', kind: 'type' })
  })

  it('returns the existing tag when kind and name match ignoring capitalisation, and inserts nothing', async () => {
    const r = await createTag('  dUBAI ', 'place')
    expect(r).toEqual({ tag: { id: 'P1', name: 'Dubai', kind: 'place' }, existed: true })
    expect(inserts('mt_tags')).toHaveLength(0)
  })

  it('a place never returns a type tag: creates a new place tag with the same name', async () => {
    const r = await createTag('safari', 'place')
    expect(r.existed).toBe(false)
    expect(r.tag).toEqual({ id: 'NEW', name: 'safari', kind: 'place' })
    expect(callsOf(inserts('mt_tags')[0], 'insert')[0][0]).toEqual({ name: 'safari', kind: 'place' })
  })

  it('a type never returns a place tag: creates a new type tag with the same name', async () => {
    const r = await createTag('DUBAI', 'type')
    expect(r.existed).toBe(false)
    expect(r.tag.kind).toBe('type')
    expect(inserts('mt_tags')).toHaveLength(1)
  })

  it('rejects a blank name without touching the database', async () => {
    await expect(createTag('   ', 'type')).rejects.toThrow(/required/i)
    expect(queries).toHaveLength(0)
  })

  it('only touches mt_tags', async () => {
    await createTag('Oman', 'place')
    expect(new Set(queries.map((q) => q.table))).toEqual(new Set(['mt_tags']))
  })
})

describe('fetchTags', () => {
  it('keeps tags of any kind, and drops only rows with a blank kind', async () => {
    tags = [...tags, { id: 'R', name: 'Coast', kind: 'region' }, { id: 'X', name: 'Odd', kind: '  ' }]
    expect((await fetchTags()).map((t) => t.id)).toEqual(['T1', 'P1', 'R'])
  })
})

describe('deleteTag', () => {
  it('makes one delete on mt_tags and leaves the links to the database cascade', async () => {
    await deleteTag('P1')
    expect(queries).toHaveLength(1)
    expect(queries[0].table).toBe('mt_tags')
    expect(callsOf(queries[0], 'delete')).toEqual([[]])
    expect(callsOf(queries[0], 'eq')).toEqual([['id', 'P1']])
  })

  it('throws when nothing was deleted', async () => {
    const fake = createFakeSupabase(() => ({ data: [], error: null }))
    vi.mocked(supabase.from).mockImplementation(fake.client.from as never)
    await expect(deleteTag('P1')).rejects.toThrow(/nothing was deleted/i)
  })
})

describe('setListingTags', () => {
  it('adds only new links and removes only dropped ones', async () => {
    links = [{ listing_id: 'L1', tag_id: 'T1' }, { listing_id: 'L1', tag_id: 'P1' }]
    await setListingTags('L1', ['T1', 'P2'])
    const ins = inserts('mt_listing_tags')
    expect(ins).toHaveLength(1)
    expect(callsOf(ins[0], 'insert')[0][0]).toEqual([{ listing_id: 'L1', tag_id: 'P2' }])
    const dels = queries.filter((q) => q.table === 'mt_listing_tags' && has(q, 'delete'))
    expect(dels).toHaveLength(1)
    expect(callsOf(dels[0], 'eq')).toEqual([['listing_id', 'L1'], ['tag_id', 'P1']])
  })
})

describe('TagsPage', () => {
  it('lists type and place tags separately', async () => {
    render(<TagsPage />)
    expect(within(await screen.findByRole('list', { name: 'Type tags' })).getByText('Safari')).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Place tags' })).getByText('Dubai')).toBeTruthy()
  })

  it('creates a tag with a trimmed name and shows it under its kind', async () => {
    render(<TagsPage />)
    fireEvent.change(await screen.findByLabelText(/tag name/i), { target: { value: '  Oman ' } })
    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: 'place' } })
    fireEvent.click(screen.getByRole('button', { name: /add tag/i }))
    expect(await screen.findByText(/added “oman”/i)).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Place tags' })).getByText('Oman')).toBeTruthy()
    expect(callsOf(inserts('mt_tags')[0], 'insert')[0][0]).toEqual({ name: 'Oman', kind: 'place' })
  })

  it('says the tag already exists instead of adding a duplicate', async () => {
    render(<TagsPage />)
    fireEvent.change(await screen.findByLabelText(/tag name/i), { target: { value: 'SAFARI' } })
    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: ' Type ' } })
    fireEvent.click(screen.getByRole('button', { name: /add tag/i }))
    expect(await screen.findByText(/“safari” already exists/i)).toBeTruthy()
    expect(inserts('mt_tags')).toHaveLength(0)
    expect(within(screen.getByRole('list', { name: 'Type tags' })).getAllByText('Safari')).toHaveLength(1)
  })

  it('adds a place tag that shares its name with a type tag', async () => {
    render(<TagsPage />)
    fireEvent.change(await screen.findByLabelText(/tag name/i), { target: { value: 'Safari' } })
    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: 'place' } })
    fireEvent.click(screen.getByRole('button', { name: /add tag/i }))
    expect(await screen.findByText(/added “safari”/i)).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Place tags' })).getByText('Safari')).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Type tags' })).getByText('Safari')).toBeTruthy()
  })

  it('creates a tag of a new kind, typed in the kind box, and lists it under that kind', async () => {
    render(<TagsPage />)
    fireEvent.change(await screen.findByLabelText(/tag name/i), { target: { value: 'Bakery' } })
    const kind = screen.getByLabelText(/kind/i)
    expect(kind.tagName).toBe('INPUT')
    expect([...document.querySelectorAll('#tag-kinds option')].map((o) => o.getAttribute('value'))).toEqual(['place', 'type'])
    fireEvent.change(kind, { target: { value: 'Food' } })
    fireEvent.click(screen.getByRole('button', { name: /add tag/i }))
    expect(await screen.findByText(/added “bakery”/i)).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Food tags' })).getByText('Bakery')).toBeTruthy()
    expect(callsOf(inserts('mt_tags')[0], 'insert')[0][0]).toEqual({ name: 'Bakery', kind: 'food' })
  })

  it('shows an error for a blank name and saves nothing', async () => {
    render(<TagsPage />)
    fireEvent.change(await screen.findByLabelText(/tag name/i), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /add tag/i }))
    expect(await screen.findByText(/tag name is required/i)).toBeTruthy()
    expect(inserts('mt_tags')).toHaveLength(0)
  })

  it('asks before deleting, says how many listings use the tag, and deletes only on confirm', async () => {
    usage = 3
    render(<TagsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Dubai' }))
    const dialog = await screen.findByRole('alertdialog', { name: /confirm delete tag dubai/i })
    expect(dialog.textContent).toMatch(/used by 3 listings/i)
    expect(queries.filter((q) => has(q, 'delete'))).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: /yes, delete tag/i }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.queryByRole('button', { name: 'Delete Dubai' })).toBeNull()
    expect(queries.filter((q) => has(q, 'delete')).map((q) => q.table)).toEqual(['mt_tags'])
  })

  it('uses the singular for one listing, and cancel deletes nothing', async () => {
    usage = 1
    render(<TagsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Safari' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toMatch(/used by 1 listing,/i)
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(queries.filter((q) => has(q, 'delete'))).toHaveLength(0)
  })
})
