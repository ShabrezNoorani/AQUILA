import { describe, expect, it } from 'vitest'
import { hrefFor, parseHash } from './router'

describe('parseHash', () => {
  it('maps hashes to routes', () => {
    expect(parseHash('')).toEqual({ name: 'listings' })
    expect(parseHash('#/')).toEqual({ name: 'listings' })
    expect(parseHash('#/listings/new')).toEqual({ name: 'new-listing' })
    expect(parseHash('#/listings/abc-123')).toEqual({ name: 'listing', id: 'abc-123' })
    expect(parseHash('#/nope/here')).toEqual({ name: 'listings' })
    expect(parseHash('#/tags')).toEqual({ name: 'tags' })
    expect(parseHash('#/tags/')).toEqual({ name: 'tags' })
  })

  it('links to the tags page', () => {
    expect(parseHash(hrefFor.tags())).toEqual({ name: 'tags' })
  })

  it('round-trips listing ids through hrefFor', () => {
    expect(parseHash(hrefFor.listing('a b/c'))).toEqual({ name: 'listing', id: 'a b/c' })
  })
})
