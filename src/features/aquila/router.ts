// Minimal hash-based routing so no router dependency is needed.
//   #/                 → listings
//   #/listings/new     → new listing form
//   #/listings/<id>    → one listing with its snapshots

import { useEffect, useState } from 'react'

export type Route =
  | { name: 'listings' }
  | { name: 'new-listing' }
  | { name: 'listing'; id: string }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '')
  if (path === '/listings/new') return { name: 'new-listing' }
  const m = path.match(/^\/listings\/([^/]+)$/)
  if (m) return { name: 'listing', id: decodeURIComponent(m[1]) }
  return { name: 'listings' }
}

export const hrefFor = {
  listings: () => '#/',
  newListing: () => '#/listings/new',
  listing: (id: string) => `#/listings/${encodeURIComponent(id)}`,
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
