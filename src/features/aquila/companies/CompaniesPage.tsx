// Competitor companies: a table of every company (name, OWN badge, listing count) with inline
// rename, and one company's listings. Listings without a company appear under "Unassigned".

import { useEffect, useState, type FormEvent } from 'react'
import { fetchListings, listCompanies, renameCompany } from '../api'
import { hrefFor } from '../router'
import type { CompanyWithCount, Listing } from '../types'
import { Badge, Button, EmptyState, FormError, Page, Table, Td, Th, THead, Tr, inputClass } from '../ui'

/** The id used in #/companies/<id> for listings that have no company. */
const UNASSIGNED = 'unassigned'

const plural = (n: number) => `${n} ${n === 1 ? 'listing' : 'listings'}`

function OwnBadge() {
  return <Badge tone="strong">OWN</Badge>
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

/** Every company, with an "Unassigned" row for listings that have no company. */
function CompaniesTable() {
  const [companies, setCompanies] = useState<CompanyWithCount[] | null>(null)
  const [unassigned, setUnassigned] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    Promise.all([listCompanies(), fetchListings()])
      .then(([rows, listings]) => {
        if (!live) return
        setCompanies(rows)
        setUnassigned(listings.filter((l) => !l.company_id).length)
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [])

  const rename = (id: string, name: string) =>
    setCompanies((prev) => (prev ?? [])
      .map((c) => (c.id === id ? { ...c, name } : c))
      .sort((a, b) => a.name.localeCompare(b.name)))

  return (
    <Page title="Competitors" meta="Companies and their listings. Our own company is marked OWN.">
      {error && <FormError>Could not load companies: {error}</FormError>}
      {!error && !companies && <p className="text-sm text-ink-3">Loading…</p>}
      {companies && companies.length === 0 && unassigned === 0 && (
        <EmptyState title="No companies yet." description="A company is added when you create a listing for it." />
      )}
      {companies && (companies.length > 0 || unassigned > 0) && (
        <Table aria-label="Companies">
          <THead>
            <tr><Th>Company</Th><Th>Marker</Th><Th className="text-right">Listings</Th></tr>
          </THead>
          <tbody>
            {companies.map((c) => (
              <Tr key={c.id}>
                <Td><NameCell company={c} onRenamed={(name) => rename(c.id, name)} /></Td>
                <Td>{c.is_own ? <OwnBadge /> : <span className="text-ink-3">Competitor</span>}</Td>
                <Td className="text-right tabular-nums">{c.listing_count}</Td>
              </Tr>
            ))}
            {unassigned > 0 && (
              <Tr>
                <Td><a href={hrefFor.unassigned()} className="font-medium text-ink-3 hover:text-accent">Unassigned</a></Td>
                <Td />
                <Td className="text-right tabular-nums">{unassigned}</Td>
              </Tr>
            )}
          </tbody>
        </Table>
      )}
    </Page>
  )
}

/** One company's listings, or the listings with no company when companyId is "unassigned". */
function CompanyListings({ companyId }: { companyId: string }) {
  const [company, setCompany] = useState<CompanyWithCount | null>(null)
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isUnassigned = companyId === UNASSIGNED

  useEffect(() => {
    let live = true
    Promise.all([isUnassigned ? Promise.resolve([]) : listCompanies(), fetchListings()])
      .then(([rows, all]) => {
        if (!live) return
        if (!isUnassigned) {
          const found = rows.find((c) => c.id === companyId)
          if (!found) {
            setError('This company does not exist. It may have been removed.')
            return
          }
          setCompany(found)
        }
        setListings(all.filter((l) => (isUnassigned ? !l.company_id : l.company_id === companyId)))
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [companyId, isUnassigned])

  const back = { href: hrefFor.companies(), label: '← All competitors' }
  const title = isUnassigned ? 'Unassigned' : company?.name ?? 'Company'

  return (
    <Page title={title} back={back}
      meta={company?.is_own ? <OwnBadge /> : isUnassigned ? 'Listings that have no company yet.' : undefined}>
      {error && <FormError>Could not load: {error}</FormError>}
      {!error && !listings && <p className="text-sm text-ink-3">Loading…</p>}
      {listings && listings.length === 0 && <EmptyState title="No listings." />}
      {listings && listings.length > 0 && (
        <Table aria-label={`Listings for ${title}`}>
          <THead>
            <tr><Th>Listing</Th><Th>Status</Th></tr>
          </THead>
          <tbody>
            {listings.map((l) => (
              <Tr key={l.id}>
                <Td><a href={hrefFor.listing(l.id)} className="font-medium text-ink hover:text-accent">{l.name}</a></Td>
                <Td><Badge tone={l.active ? 'positive' : 'neutral'}>{l.active ? 'Active' : 'Inactive'}</Badge></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      {listings && <p className="text-sm text-ink-3">{plural(listings.length)}</p>}
    </Page>
  )
}

export default function CompaniesPage({ companyId }: { companyId?: string }) {
  return companyId ? <CompanyListings companyId={companyId} /> : <CompaniesTable />
}
