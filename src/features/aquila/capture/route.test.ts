import { describe, expect, it } from 'vitest'
import { hrefFor, parseHash } from '../router'

describe('import route', () => {
  it('parses the import page address', () => {
    expect(parseHash('#/listings/abc-123/import')).toEqual({ name: 'import', id: 'abc-123' })
  })
  it('round-trips through hrefFor.importPage', () => {
    expect(parseHash(hrefFor.importPage('a b/c'))).toEqual({ name: 'import', id: 'a b/c' })
  })
  it('leaves the other routes unchanged', () => {
    expect(parseHash('#/listings/abc')).toEqual({ name: 'listing', id: 'abc' })
    expect(parseHash('#/listings/new')).toEqual({ name: 'new-listing' })
  })
})
