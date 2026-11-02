import { describe, expect, it } from 'vitest'
import {
  commaListToArray,
  linesToArray,
  parseOptionLine,
  parseOptions,
  parseRating,
  parseReviewCount,
} from './parse'

describe('linesToArray', () => {
  it('splits on newlines, trims, and drops blank lines', () => {
    expect(linesToArray('  Sunset views \n\n Camel ride\r\nBBQ dinner  \n')).toEqual([
      'Sunset views',
      'Camel ride',
      'BBQ dinner',
    ])
  })

  it('returns an empty array for empty or whitespace input', () => {
    expect(linesToArray('')).toEqual([])
    expect(linesToArray('  \n \n')).toEqual([])
  })
})

describe('commaListToArray', () => {
  it('splits on commas, trims, and drops empties', () => {
    expect(commaListToArray(' English, Arabic ,, French ')).toEqual(['English', 'Arabic', 'French'])
  })

  it('returns an empty array for empty input', () => {
    expect(commaListToArray('   ')).toEqual([])
  })
})

describe('parseOptionLine', () => {
  it('parses name | description | price', () => {
    expect(parseOptionLine('Shared | Group transfer from hotel | 120')).toEqual({
      ok: true,
      value: { name: 'Shared', description: 'Group transfer from hotel', price: 120 },
    })
  })

  it('accepts decimals, thousands separators and a currency symbol', () => {
    expect(parseOptionLine('VIP | Private car | $1,250.50')).toEqual({
      ok: true,
      value: { name: 'VIP', description: 'Private car', price: 1250.5 },
    })
  })

  it('allows missing description and price', () => {
    expect(parseOptionLine('Basic')).toEqual({
      ok: true,
      value: { name: 'Basic', description: null, price: null },
    })
    expect(parseOptionLine('Basic |  | ')).toEqual({
      ok: true,
      value: { name: 'Basic', description: null, price: null },
    })
  })

  it('rejects an invalid price', () => {
    const r = parseOptionLine('Shared | Group | abc')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/price/i)
  })

  it('rejects a negative price', () => {
    expect(parseOptionLine('Shared | Group | -5').ok).toBe(false)
  })

  it('rejects an empty name', () => {
    const r = parseOptionLine(' | Group | 50')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/name/i)
  })

  it('rejects more than three parts', () => {
    expect(parseOptionLine('A | B | 10 | extra').ok).toBe(false)
  })
})

describe('parseOptions', () => {
  it('parses every non-blank line', () => {
    expect(parseOptions('Shared | Group | 100\n\nPrivate | Own car | 300')).toEqual({
      ok: true,
      value: [
        { name: 'Shared', description: 'Group', price: 100 },
        { name: 'Private', description: 'Own car', price: 300 },
      ],
    })
  })

  it('reports the line number of the first bad line', () => {
    const r = parseOptions('Shared | Group | 100\nPrivate | Own car | lots')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/line 2/i)
  })

  it('returns an empty array for empty input', () => {
    expect(parseOptions('')).toEqual({ ok: true, value: [] })
  })
})

describe('parseRating', () => {
  it('returns null for empty input', () => {
    expect(parseRating('  ')).toEqual({ ok: true, value: null })
  })
  it('accepts 0 to 5', () => {
    expect(parseRating('4.7')).toEqual({ ok: true, value: 4.7 })
    expect(parseRating('0')).toEqual({ ok: true, value: 0 })
    expect(parseRating('5')).toEqual({ ok: true, value: 5 })
  })
  it('rejects out of range or non-numbers', () => {
    expect(parseRating('5.1').ok).toBe(false)
    expect(parseRating('-1').ok).toBe(false)
    expect(parseRating('great').ok).toBe(false)
  })
})

describe('parseReviewCount', () => {
  it('returns null for empty input', () => {
    expect(parseReviewCount('')).toEqual({ ok: true, value: null })
  })
  it('accepts whole numbers with thousands separators', () => {
    expect(parseReviewCount('1,234')).toEqual({ ok: true, value: 1234 })
  })
  it('rejects decimals, negatives and text', () => {
    expect(parseReviewCount('12.5').ok).toBe(false)
    expect(parseReviewCount('-3').ok).toBe(false)
    expect(parseReviewCount('many').ok).toBe(false)
  })
})
