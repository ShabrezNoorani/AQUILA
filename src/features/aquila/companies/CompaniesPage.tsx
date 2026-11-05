// Companies: every company as a Library of cards or a List (table), sorted A to Z or Z to A,
// filtered by tags, with inline rename; and one company's listings. Listings without a company
// appear under "Unassigned". Tag names always come from mt_tags; none are written here.

import { useEffect, useState, type FormEvent } from 'react'
import { fetchAllListingTags, fetchListings, fetchTags, listCompanies, renameCompany } from '../api'
import { hrefFor } from '../router'
import { tagsByListing } from '../tags/tagMapping'
import { TagChips } from '../tags/TagPicker'
import { TAG_KINDS, type CompanyWithCount, type Listing, type Tag } from '../types'
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
  /** Every tag used by at least one listing: types first, then places, each by name. */
  usedTags: Tag[]
}

async function loadData(): Promise<Data> {
  const [companies, listings, tags, links] = await Promise.all([
    listCompanies(), fetchListings(), fetchTags(), fetchAllListingTags(),
  ])
  const tagMap = tagsByListing(links, tags)
  const used = new Map<string, Tag>()
  for (const list of tagMap.values()) for (const t of list) used.set(t.id, t)
  const usedTags = [...used.values()].sort(
    (a, b) => TAG_KINDS.indexOf(a.kind) - TAG_KINDS.indexOf(b.kind) || a.name.localeCompare(b.name),
  )
  return { companies, listings, tagMap, usedTags }
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

/** True when the listing carries every selected tag (and always when none are selected). */
const hasAllTags = (tagMap: Map<string, Tag[]>, listingId: string, selected: string[]) => {
  if (!selected.length) return true
  const ids = new Set((tagMap.get(listingId) ?? []).map((t) => t.id))
  return selected.every((id) => ids.has(id))
}

/** Sorts by name ignoring capitals; A to Z or Z to A. */
const byName = (sort: Sort) => (a: { name: string }, b: { name: string }) => {
  const r = a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase())
  return sort === 'az' ? r : -r
}

/** Unique tags of several listings, types first, then by name. */
function tagsOfListings(tagMap: Map<string, Tag[]>, listings: Listing[]): Tag[] {
  const out = new Map<string, Tag>()
  for (const l of listings) for (const t of tagMap.get(l.id) ?? []) out.set(t.id, t)
  return [...out.values()].sort(
    (a, b) => TAG_KINDS.indexOf(a.kind) - TAG_KINDS.indexOf(b.kind) || a.name.localeCompare(b.name),
  )
}

const plural = (n: number) => `${n} ${n === 1 ? 'listing' : 'listings'}`

// ---------- pieces ----------

function OwnBadge() {
  return <Badge tone="strong">OWN</Badge>
}

/** Every used tag as a toggle. Several can be selected; a listing must carry all of them. */
function TagFilter({ tags, selected, onChange }: { tags: Tag[]; selected: string[]; onChange: (ids: string[]) => void }) {
  if (!tags.length) return null
  const on = new Set(selected)
  const toggle = (id: string) => onChange(on.has(id) ? selected.filter((s) => s !== id) : [...selected, id])
  return (
    <div role="group" aria-label="Filter by tag" className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-ink-3">Tags:</span>
      {tags.map((t) => (
        <button key={t.id} type="button" aria-pressed={on.has(t.id)} data-kind={t.kind} onClick={() => toggle(t.id)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            on.has(t.id)
              ? 'border-accent bg-accent/8 text-accent'
              : 'border-line bg-surface text-ink-2 hover:bg-paper hover:text-ink'}`}>
          {t.name}
        </button>
      ))}
      {selected.length > 0 && <Button size="sm" variant="ghost" onClick={() => onChange([])}>Clear</Button>}
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

// ---------- the companies page ----------

/** A company (or the Unassigned group) as shown: its listings, the matching ones, and their tags. */
type Row = { company: CompanyWithCount | null; total: number; matching: number; tags: Tag[] }

function CompaniesOverview() {
  const { data, setData, error } = useData()
  const [view, setView] = useState<View>(() => readStored(() => localStorage, VIEW_KEY, ['library', 'list'], 'library'))
  const [sort, setSort] = useState<Sort>(() => readStored(() => localStorage, SORT_KEY, ['az', 'za'], 'az'))
  const [selected, setSelected] = useSelectedTags()

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
    <Page title="Companies" meta="Companies and their listings. Our own company is marked OWN.">
      {error && <FormError>Could not load companies: {error}</FormError>}
      {!error && !data && <p className="text-sm text-ink-3">Loading…</p>}
      {nothingYet && <EmptyState title="No companies yet." description="A company is added when you create a listing for it." />}
      {data && !nothingYet && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="View" className="inline-flex rounded-card border border-line bg-paper p-1">
              {(['library', 'list'] as const).map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => chooseView(v)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                    view === v ? 'bg-surface text-ink shadow-sm shadow-ink/5' : 'text-ink-3 hover:text-ink'}`}>
                  {v === 'library' ? 'Library' : 'List'}
                </button>
              ))}
            </div>
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
                <tr><Th>Company</Th><Th>Marker</Th><Th className="text-right">Listings</Th></tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.company!.id}>
                    <Td><NameCell company={r.company!} onRenamed={(name) => rename(r.company!.id, name)} /></Td>
                    <Td>{r.company!.is_own ? <OwnBadge /> : <span className="text-ink-3">Competitor</span>}</Td>
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

/** One company's listings, or the listings with no company when companyId is "unassigned". */
function CompanyListings({ companyId }: { companyId: string }) {
  const { data, error } = useData()
  const [selected, setSelected] = useSelectedTags()
  const isUnassigned = companyId === UNASSIGNED
  const company = isUnassigned ? null : data?.companies.find((c) => c.id === companyId) ?? null
  const missing = !!data && !isUnassigned && !company

  const usedIds = new Set(data?.usedTags.map((t) => t.id) ?? [])
  const active = data ? selected.filter((id) => usedIds.has(id)) : selected
  const own = data ? data.listings.filter((l) => (isUnassigned ? !l.company_id : l.company_id === companyId)) : []
  const shown = data ? own.filter((l) => hasAllTags(data.tagMap, l.id, active)) : []

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
          <TagFilter tags={data.usedTags} selected={active} onChange={setSelected} />
          {shown.length === 0 && (
            <EmptyState title={active.length ? 'No listings here have all the selected tags.' : 'No listings.'} />
          )}
          {shown.length > 0 && (
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
