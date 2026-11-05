// Companies: every company as a Library of cards or a List (table), sorted A to Z or Z to A,
// filtered by tags, with inline rename; and one company's listings, also as Library or List. Listings without a company
// appear under "Unassigned". Tag names always come from mt_tags; none are written here.

import { useEffect, useState, type FormEvent } from 'react'
import {
  createCompany, fetchAllListingTags, fetchListingSummary, fetchListings, fetchTags, listCompanies, renameCompany,
  type ListingSummary,
} from '../api'
import { hrefFor } from '../router'
import TagFilter from '../tags/TagFilter'
import { byKindThenName, hasAllTags, tagsByListing, usedTags } from '../tags/tagMapping'
import { TagChips } from '../tags/TagPicker'
import type { CompanyWithCount, Listing, Tag } from '../types'
import { Badge, Button, EmptyState, FormError, Page, Table, Td, Th, THead, Tr, inputClass } from '../ui'

/** The id used in #/companies/<id> for listings that have no company. */
const UNASSIGNED = 'unassigned'

type View = 'library' | 'list'
type Sort = 'az' | 'za'

// ---------- remembered choices ----------
// View and sort are kept in localStorage. The tag filter is kept for this browser session, so it
// carries from the companies to one company's listings but does not linger for days.
// Storage can be missing or blocked (private mode), so every access is wrapped.

const VIEW_KEY = 'aquila.companies.view'
const SORT_KEY = 'aquila.companies.sort'
const TAGS_KEY = 'aquila.companies.tags'
/** The view chosen inside one company: Library (cards) or List (table). */
const COMPANY_VIEW_KEY = 'aquila.company.view'

function readStored<T extends string>(storage: () => Storage, key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = storage().getItem(key)
    return allowed.includes(v as T) ? (v as T) : fallback
  } catch {
    return fallback
  }
}

function writeStored(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value)
  } catch {
    // Not saved; the choice still applies until the page is closed.
  }
}

function readSelectedTags(): string[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(TAGS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** The chosen tag ids, shared by the companies page and one company's page. */
function useSelectedTags() {
  const [selected, setSelected] = useState<string[]>(readSelectedTags)
  const update = (ids: string[]) => {
    setSelected(ids)
    writeStored(() => sessionStorage, TAGS_KEY, JSON.stringify(ids))
  }
  return [selected, update] as const
}

// ---------- data ----------

type Data = {
  companies: CompanyWithCount[]
  listings: Listing[]
  /** Each listing's tags. */
  tagMap: Map<string, Tag[]>
  /** Every tag used by at least one listing, by kind then name. */
  usedTags: Tag[]
}

async function loadData(): Promise<Data> {
  const [companies, listings, tags, links] = await Promise.all([
    listCompanies(), fetchListings(), fetchTags(), fetchAllListingTags(),
  ])
  const tagMap = tagsByListing(links, tags)
  return { companies, listings, tagMap, usedTags: usedTags(tagMap) }
}

function useData() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    loadData()
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [])
  return { data, setData, error }
}

/** Sorts by name ignoring capitals; A to Z or Z to A. */
const byName = (sort: Sort) => (a: { name: string }, b: { name: string }) => {
  const r = a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase())
  return sort === 'az' ? r : -r
}

/** Unique tags of several listings, by kind then name. */
function tagsOfListings(tagMap: Map<string, Tag[]>, listings: Listing[]): Tag[] {
  const out = new Map<string, Tag>()
  for (const l of listings) for (const t of tagMap.get(l.id) ?? []) out.set(t.id, t)
  return [...out.values()].sort(byKindThenName)
}

const plural = (n: number) => `${n} ${n === 1 ? 'listing' : 'listings'}`

// ---------- pieces ----------

function OwnBadge() {
  return <Badge tone="strong">OWN</Badge>
}

/** The "Library" and "List" buttons. */
function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div role="group" aria-label="View" className="inline-flex rounded-card border border-line bg-paper p-1">
      {(['library', 'list'] as const).map((v) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => onChange(v)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            view === v ? 'bg-surface text-ink shadow-sm shadow-ink/5' : 'text-ink-3 hover:text-ink'}`}>
          {v === 'library' ? 'Library' : 'List'}
        </button>
      ))}
    </div>
  )
}

/** One company's name, as a link, with an inline rename form. */
function NameCell({ company, onRenamed }: { company: CompanyWithCount; onRenamed: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(company.name)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      // Refuses an empty name, or one another company has (ignoring capitals and extra spaces).
      const saved = await renameCompany(company.id, name)
      onRenamed(saved.name)
      setEditing(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <a href={hrefFor.company(company.id)} className="font-medium text-ink hover:text-accent">{company.name}</a>
        <Button size="sm" variant="ghost" aria-label={`Rename ${company.name}`}
          onClick={() => { setName(company.name); setError(null); setEditing(true) }}>
          Rename
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={save} aria-label={`Rename ${company.name}`} className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`company-name-${company.id}`} className="sr-only">Company name</label>
        <input id={`company-name-${company.id}`} className={`${inputClass} max-w-64`} value={name} disabled={busy}
          onChange={(e) => setName(e.target.value)} autoFocus />
        <Button type="submit" size="sm" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        <Button size="sm" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
      </div>
      {error && <p role="alert" className="text-sm text-negative-deep">Could not rename: {error}</p>}
    </form>
  )
}

/** "New company": a name and an OWN tick box. A name that already exists is not duplicated. */
function NewCompanyForm({ onCreated, onCancel }: { onCreated: (c: CompanyWithCount, existed: boolean) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [own, setOwn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const { company, existed } = await createCompany(name, own)
      onCreated({ ...company, listing_count: 0 }, existed)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} noValidate aria-label="New company"
      className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-sm shadow-ink/5">
      <div className="space-y-1.5">
        <label htmlFor="new-company-name" className="block text-sm font-medium text-ink">Company name *</label>
        <input id="new-company-name" className={`${inputClass} max-w-md`} value={name} disabled={busy} autoFocus
          onChange={(e) => setName(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input type="checkbox" className="h-4 w-4 accent-ink" checked={own} disabled={busy}
          onChange={(e) => setOwn(e.target.checked)} />
        This is ours (OWN)
      </label>
      {error && <p role="alert" className="text-sm text-negative-deep">Could not add: {error}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Adding…' : 'Add company'}</Button>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </form>
  )
}

// ---------- the companies page ----------

/** A company (or the Unassigned group) as shown: its listings, the matching ones, and their tags. */
type Row = { company: CompanyWithCount | null; total: number; matching: number; tags: Tag[] }

function CompaniesOverview() {
  const { data, setData, error } = useData()
  const [view, setView] = useState<View>(() => readStored(() => localStorage, VIEW_KEY, ['library', 'list'], 'library'))
  const [sort, setSort] = useState<Sort>(() => readStored(() => localStorage, SORT_KEY, ['az', 'za'], 'az'))
  const [selected, setSelected] = useSelectedTags()
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const added = (company: CompanyWithCount, existed: boolean) => {
    setAdding(false)
    if (existed) {
      setNotice(`“${company.name}” already exists, so no new company was added.`)
      return
    }
    setNotice(`Added “${company.name}”${company.is_own ? ' as OWN' : ''}.`)
    setData((d) => d && { ...d, companies: [...d.companies, company] })
  }

  const chooseView = (v: View) => {
    setView(v)
    writeStored(() => localStorage, VIEW_KEY, v)
  }
  const chooseSort = (s: Sort) => {
    setSort(s)
    writeStored(() => localStorage, SORT_KEY, s)
  }

  const rename = (id: string, name: string) =>
    setData((d) => d && { ...d, companies: d.companies.map((c) => (c.id === id ? { ...c, name } : c)) })

  // Tags that no listing uses any more are dropped from the selection.
  const usedIds = new Set(data?.usedTags.map((t) => t.id) ?? [])
  const active = data ? selected.filter((id) => usedIds.has(id)) : selected
  const filtering = active.length > 0

  const rowFor = (company: CompanyWithCount | null): Row => {
    const own = (data?.listings ?? []).filter((l) => (company ? l.company_id === company.id : !l.company_id))
    const matching = own.filter((l) => hasAllTags(data!.tagMap, l.id, active))
    return { company, total: company ? company.listing_count : own.length, matching: matching.length, tags: tagsOfListings(data!.tagMap, own) }
  }

  const rows = data
    ? [...data.companies].sort(byName(sort)).map(rowFor).filter((r) => !filtering || r.matching > 0)
    : []
  const unassigned = data ? rowFor(null) : null
  const showUnassigned = !!unassigned && (filtering ? unassigned.matching > 0 : unassigned.total > 0)
  const nothingYet = data && data.companies.length === 0 && !showUnassigned && !filtering

  const count = (r: Row) => (filtering ? `${r.matching} of ${plural(r.total)} match` : plural(r.total))

  return (
    <Page title="Companies" meta="Companies and their listings. Our own company is marked OWN."
      actions={data && !adding
        ? <Button variant="primary" onClick={() => { setNotice(null); setAdding(true) }}>New company</Button>
        : undefined}>
      {adding && <NewCompanyForm onCreated={added} onCancel={() => setAdding(false)} />}
      {notice && <p role="status" className="rounded-card border border-line bg-surface px-3 py-2 text-sm text-ink-2">{notice}</p>}
      {error && <FormError>Could not load companies: {error}</FormError>}
      {!error && !data && <p className="text-sm text-ink-3">Loading…</p>}
      {nothingYet && <EmptyState title="No companies yet." description="A company is added when you create a listing for it." />}
      {data && !nothingYet && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ViewToggle view={view} onChange={chooseView} />
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              Sort
              <select className={`${inputClass} w-auto`} value={sort} onChange={(e) => chooseSort(e.target.value as Sort)}>
                <option value="az">A to Z</option>
                <option value="za">Z to A</option>
              </select>
            </label>
          </div>

          <TagFilter tags={data.usedTags} selected={active} onChange={setSelected} />

          {filtering && rows.length === 0 && !showUnassigned && (
            <EmptyState compact title="No company has a listing with all the selected tags." />
          )}

          {view === 'library' && (rows.length > 0 || showUnassigned) && (
            <ul aria-label="Companies" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((r) => (
                <li key={r.company!.id} className="space-y-3 rounded-card border border-line bg-surface p-5 shadow-sm shadow-ink/5">
                  <div className="flex items-start justify-between gap-2">
                    <NameCell company={r.company!} onRenamed={(name) => rename(r.company!.id, name)} />
                    {r.company!.is_own && <OwnBadge />}
                  </div>
                  <p className="text-sm text-ink-3">{count(r)}</p>
                  <TagChips tags={r.tags} />
                </li>
              ))}
              {showUnassigned && (
                <li className="space-y-3 rounded-card border border-dashed border-line bg-surface p-5">
                  <a href={hrefFor.unassigned()} className="font-medium text-ink-3 hover:text-accent">Unassigned</a>
                  <p className="text-sm text-ink-3">{count(unassigned!)}</p>
                  <TagChips tags={unassigned!.tags} />
                </li>
              )}
            </ul>
          )}

          {view === 'list' && (rows.length > 0 || showUnassigned) && (
            <Table aria-label="Companies">
              <THead>
                <tr><Th>Company</Th><Th>OWN</Th><Th className="text-right">Listings</Th></tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.company!.id}>
                    <Td><NameCell company={r.company!} onRenamed={(name) => rename(r.company!.id, name)} /></Td>
                    <Td>{r.company!.is_own && <OwnBadge />}</Td>
                    <Td className="text-right tabular-nums">{filtering ? `${r.matching} of ${r.total}` : r.total}</Td>
                  </Tr>
                ))}
                {showUnassigned && (
                  <Tr>
                    <Td><a href={hrefFor.unassigned()} className="font-medium text-ink-3 hover:text-accent">Unassigned</a></Td>
                    <Td />
                    <Td className="text-right tabular-nums">
                      {filtering ? `${unassigned!.matching} of ${unassigned!.total}` : unassigned!.total}
                    </Td>
                  </Tr>
                )}
              </tbody>
            </Table>
          )}
        </>
      )}
    </Page>
  )
}

// ---------- one company's listings ----------

/** Each listing's latest rating, reviews and lowest price, loaded one by one; a failed one stays missing. */
function useSummaries(listingIds: string[]) {
  const [summaries, setSummaries] = useState<Map<string, ListingSummary>>(new Map())
  const key = listingIds.join(',')
  useEffect(() => {
    let live = true
    for (const id of key ? key.split(',') : []) {
      fetchListingSummary(id)
        .then((s) => live && setSummaries((m) => new Map(m).set(id, s)))
        .catch(() => {
          // This card shows "—" instead of numbers.
        })
    }
    return () => {
      live = false
    }
  }, [key])
  return summaries
}

const formatPrice = (n: number) => n.toLocaleString('en', { maximumFractionDigits: 2 })

/** Rating and review count, e.g. "4.8 ★ · 120 reviews". */
function ratingText(s: ListingSummary | undefined): string {
  if (!s || (s.rating == null && s.review_count == null)) return 'No rating yet'
  const parts = []
  if (s.rating != null) parts.push(`${s.rating} ★`)
  if (s.review_count != null) parts.push(`${s.review_count.toLocaleString('en')} ${s.review_count === 1 ? 'review' : 'reviews'}`)
  return parts.join(' · ')
}

/** One company's listings, or the listings with no company when companyId is "unassigned". */
function CompanyListings({ companyId }: { companyId: string }) {
  const { data, error } = useData()
  const [selected, setSelected] = useSelectedTags()
  const [view, setView] = useState<View>(() => readStored(() => localStorage, COMPANY_VIEW_KEY, ['library', 'list'], 'library'))
  const isUnassigned = companyId === UNASSIGNED
  const company = isUnassigned ? null : data?.companies.find((c) => c.id === companyId) ?? null
  const missing = !!data && !isUnassigned && !company

  const usedIds = new Set(data?.usedTags.map((t) => t.id) ?? [])
  const active = data ? selected.filter((id) => usedIds.has(id)) : selected
  const own = data ? data.listings.filter((l) => (isUnassigned ? !l.company_id : l.company_id === companyId)) : []
  const shown = data ? own.filter((l) => hasAllTags(data.tagMap, l.id, active)) : []
  const summaries = useSummaries(view === 'library' && !missing ? shown.map((l) => l.id) : [])

  const chooseView = (v: View) => {
    setView(v)
    writeStored(() => localStorage, COMPANY_VIEW_KEY, v)
  }

  const back = { href: hrefFor.companies(), label: '← All companies' }
  const title = isUnassigned ? 'Unassigned' : company?.name ?? 'Company'

  return (
    <Page title={title} back={back}
      meta={company?.is_own ? <OwnBadge /> : isUnassigned ? 'Listings that have no company yet.' : undefined}>
      {error && <FormError>Could not load: {error}</FormError>}
      {missing && <FormError>Could not load: This company does not exist. It may have been removed.</FormError>}
      {!error && !data && <p className="text-sm text-ink-3">Loading…</p>}
      {data && !missing && (
        <>
          <ViewToggle view={view} onChange={chooseView} />
          <TagFilter tags={data.usedTags} selected={active} onChange={setSelected} />
          {shown.length === 0 && (
            <EmptyState title={active.length ? 'No listings here have all the selected tags.' : 'No listings.'} />
          )}
          {view === 'library' && shown.length > 0 && (
            <ul aria-label={`Listings for ${title}`} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((l) => {
                const s = summaries.get(l.id)
                return (
                  <li key={l.id} aria-label={l.name}
                    className="space-y-3 rounded-card border border-line bg-surface p-5 shadow-sm shadow-ink/5">
                    <div className="flex items-start justify-between gap-2">
                      <a href={hrefFor.listing(l.id)} className="font-medium text-ink hover:text-accent">{l.name}</a>
                      {company?.is_own && <OwnBadge />}
                    </div>
                    <p className="text-sm text-ink-3">{company?.name ?? 'Unassigned'}</p>
                    <p className="text-sm text-ink-2">
                      {s?.price_from != null ? `From ${formatPrice(s.price_from)}` : 'No price yet'}
                    </p>
                    <p className="text-sm text-ink-2">{ratingText(s)}</p>
                    <TagChips tags={data.tagMap.get(l.id) ?? []} />
                  </li>
                )
              })}
            </ul>
          )}
          {view === 'list' && shown.length > 0 && (
            <Table aria-label={`Listings for ${title}`}>
              <THead>
                <tr><Th>Listing</Th><Th>Tags</Th><Th>Status</Th></tr>
              </THead>
              <tbody>
                {shown.map((l) => (
                  <Tr key={l.id}>
                    <Td><a href={hrefFor.listing(l.id)} className="font-medium text-ink hover:text-accent">{l.name}</a></Td>
                    <Td><TagChips tags={data.tagMap.get(l.id) ?? []} /></Td>
                    <Td><Badge tone={l.active ? 'positive' : 'neutral'}>{l.active ? 'Active' : 'Inactive'}</Badge></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="text-sm text-ink-3">
            {active.length ? `${shown.length} of ${plural(own.length)} match the selected tags` : plural(own.length)}
          </p>
        </>
      )}
    </Page>
  )
}

export default function CompaniesPage({ companyId }: { companyId?: string }) {
  return companyId ? <CompanyListings companyId={companyId} /> : <CompaniesOverview />
}
