// Minimal hash-based routing so no router dependency is needed.
//   #/                 → listings
//   #/listings/new     → new listing form
//   #/listings/<id>    → one listing with its snapshots
//   #/listings/<id>/import → import a snapshot from a pasted page
//   #/tags             → manage type and place tags
//   #/ask              → ask AI about listings with chosen tags
//   #/help             → the AQUILA manual
//   #/companies        → competitor companies
//   #/companies/<id>   → one company's listings ('unassigned' for listings with no company)

import { useEffect, useState } from 'react'

export type Route =
  | { name: 'listings' }
  | { name: 'new-listing' }
  | { name: 'listing'; id: string }
  | { name: 'import'; id: string }
  | { name: 'tags' }
  | { name: 'ask' }
  | { name: 'help' }
  | { name: 'companies' }
  | { name: 'company'; id: string }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '')
  if (path === '/listings/new') return { name: 'new-listing' }
  if (path === '/tags') return { name: 'tags' }
  if (path === '/ask') return { name: 'ask' }
  if (path === '/help') return { name: 'help' }
  if (path === '/companies') return { name: 'companies' }
  const company = path.match(/^\/companies\/([^/]+)$/)
  if (company) return { name: 'company', id: decodeURIComponent(company[1]) }
  const imp = path.match(/^\/listings\/([^/]+)\/import$/)
  if (imp) return { name: 'import', id: decodeURIComponent(imp[1]) }
  const m = path.match(/^\/listings\/([^/]+)$/)
  if (m) return { name: 'listing', id: decodeURIComponent(m[1]) }
  return { name: 'listings' }
}

export const hrefFor = {
  listings: () => '#/',
  newListing: () => '#/listings/new',
  listing: (id: string) => `#/listings/${encodeURIComponent(id)}`,
  importPage: (id: string) => `#/listings/${encodeURIComponent(id)}/import`,
  tags: () => '#/tags',
  ask: () => '#/ask',
  help: () => '#/help',
  companies: () => '#/companies',
  company: (id: string) => `#/companies/${encodeURIComponent(id)}`,
  /** The page listing every listing that has no company. */
  unassigned: () => '#/companies/unassigned',
}

export function navigate(href: string) {
  window.location.hash = href
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
