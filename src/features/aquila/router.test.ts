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

  it('maps the competitor company routes', () => {
    expect(parseHash('#/companies')).toEqual({ name: 'companies' })
    expect(parseHash('#/companies/')).toEqual({ name: 'companies' })
    expect(parseHash('#/companies/c-1')).toEqual({ name: 'company', id: 'c-1' })
    expect(parseHash(hrefFor.companies())).toEqual({ name: 'companies' })
    expect(parseHash(hrefFor.company('a b'))).toEqual({ name: 'company', id: 'a b' })
    expect(parseHash(hrefFor.unassigned())).toEqual({ name: 'company', id: 'unassigned' })
  })

  it('round-trips listing ids through hrefFor', () => {
    expect(parseHash(hrefFor.listing('a b/c'))).toEqual({ name: 'listing', id: 'a b/c' })
  })
})
