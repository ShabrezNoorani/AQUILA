import { describe, expect, it } from 'vitest'
import viator1 from '../../../../fixtures/viator-1.html?raw'
import viator2 from '../../../../fixtures/viator-2.html?raw'
import viator3 from '../../../../fixtures/viator-3.html?raw'
import viator4 from '../../../../fixtures/viator-4.html?raw'
import viator5 from '../../../../fixtures/viator-5.html?raw'
import viator6 from '../../../../fixtures/viator-6.html?raw'
import viator7 from '../../../../fixtures/viator-7.html?raw'
import { parseOptions } from '../parse'
import { snapshotFormToRow } from '../mapping'
import { computeStatus, parseViatorListing } from './viatorParser'

const fixtures = { 'viator-1': viator1, 'viator-2': viator2, 'viator-3': viator3, 'viator-4': viator4, 'viator-5': viator5 }
const URL1 = 'https://www.viator.com/tours/Paris/Notre-Dame-8AM-Interior-Access-and-Exterior-Guided-Tour/d479-5591586P13'

describe('parseViatorListing on every fixture', () => {
  for (const [name, html] of Object.entries(fixtures)) {
    it(`${name}: non-empty title, at least one option, and a form that maps cleanly`, () => {
      const r = parseViatorListing(html, 'https://www.viator.com/x')
      expect(r.fields.title.trim()).not.toBe('')
      expect(r.fields.options.split('\n').filter((l) => l.trim()).length).toBeGreaterThanOrEqual(1)
      expect(snapshotFormToRow('listing-1', r.fields).ok).toBe(true)
      expect(r.fields.rating).toMatch(/^\d\.\d$/)
      expect(r.fields.overview.trim()).not.toBe('')
      // Saved pages carry no per-option prices, so none can be complete.
      expect(r.missing).toContain('option_prices')
      expect(r.status).toBe('partial')
    }, 30_000)
  }
})

describe('parseViatorListing exact values for viator-1', () => {
  const r = parseViatorListing(viator1, URL1)

  it('extracts the core fields', () => {
    expect(r.fields.title).toBe('Paris Notre Dame Cathedral Guided Tour - Early Access')
    expect(r.fields.duration).toBe('1 hour to 1 hour 30 minutes (approx.)')
    expect(r.fields.languages).toBe('English')
    // Page text: "4.7 · 283 Reviews" and "Reviews 4.7 based on 283 reviews".
    expect(r.fields.rating).toBe('4.7')
    expect(r.fields.review_count).toBe('283')
  })

  it('extracts options in the page order, without prices', () => {
    expect(r.fields.options).toBe(
      ['Interior Guided Tour', 'Private Expert Tour', 'Guided Tour & Cathedral Visit'].join('\n'),
    )
  })

  it('extracts inclusions, exclusions and the itinerary', () => {
    expect(r.fields.inclusions).toBe(
      [
        'Expert Paris guide (all options)',
        'State-licensed guide (Interior Guided Tour option)',
        'Self-guided cathedral visit (Guided Tour option and Private tour)',
        'Reserved interior access with audio headsets (Interior Tour Option only)',
        'Semi-private, max 9 guests (Interior Tour option only)',
        '4:30 PM start: Not Early Access. Mass may cause 20-minute lines. Your guide keeps you engaged.',
      ].join('\n'),
    )
    expect(r.fields.exclusions).toBe(
      ['Hotel pickup and drop-off', 'Food, drinks & personal expenses', 'Tower Access'].join('\n'),
    )
    expect(r.fields.itinerary).toBe('Cathedrale Notre-Dame de Paris')
  })

  it('extracts the visible urgency messages', () => {
    expect(r.fields.urgency_text).toBe(
      'High interest: Booked 4 times today. · Book ahead! On average, this is booked 46 days in advance.',
    )
  })

  it('leaves fields that are not on the page empty and lists them as missing', () => {
    expect(r.fields.group_type).toBe('')
    expect(r.fields.highlights).toBe('')
    expect(r.fields.why_this).toBe('')
    expect(r.missing).toEqual(['group_type', 'highlights', 'why_this', 'option_prices'])
  })

  it('is partial because no option has a price', () => {
    expect(r.status).toBe('partial')
  })

  it('returns readable page text without scripts', () => {
    expect(r.rawText).toContain('Paris Notre Dame Cathedral Guided Tour - Early Access')
    expect(r.rawText).not.toContain('__PRELOADED_DATA__')
    expect(r.rawText).not.toMatch(/\s{2,}/)
  })
})

describe('parseViatorListing overview and why-this on viator-2', () => {
  const r = parseViatorListing(viator2, 'https://www.viator.com/tours/Paris/x/d479-8954P40')

  it('fills overview from the Overview section, one paragraph per line', () => {
    expect(r.fields.overview).toBe(
      [
        'Discover the history, beauty, and remarkable rebirth of Notre-Dame Cathedral with an expert local Paris guide on this immersive walking experience through the heart of historic Paris.',
        'Your experience begins with a comprehensive guided walking tour around the exterior of the newly restored Notre-Dame Cathedral and the historic Île de la Cité.',
        'Following your guided introduction, you are free to enter Notre-Dame Cathedral independently allowing you to explore the magnificent interior at your own pace and discover its beauty in a peaceful and personal way.',
        'Unlike a traditional interior guided tour, this experience gives you the freedom to spend as much time as you wish inside the cathedral after receiving all the historical context and recommendations from your guide.',
        "You'll also explore the enchanting streets of the Île de la Cité, the birthplace of Paris, discovering hidden squares, historic bridges, medieval streets, and many of the city's most iconic landmarks.",
      ].join('\n'),
    )
  })

  it('does not put the why-this block into the overview', () => {
    expect(r.fields.overview).not.toContain('Why Travelers Choose')
    expect(r.fields.overview).not.toContain('Sainte-Chapelle—a lesser-known spot')
  })

  it('fills why_this from the "Why Travelers Choose This Tour" block', () => {
    expect(r.fields.why_this).toBe(
      'The optional upgrade gains you access to Sainte-Chapelle—a lesser-known spot many visitors miss.',
    )
    expect(r.missing).not.toContain('why_this')
  })

  it('still ignores the review-theme tags', () => {
    expect(r.fields.why_this).not.toMatch(/Great guides|Family fun|Points of interest/)
  })
})

describe('why_this on the fixtures without the block', () => {
  for (const [name, html] of Object.entries({ 'viator-1': viator1, 'viator-3': viator3, 'viator-4': viator4, 'viator-5': viator5 })) {
    it(`${name}: leaves why_this empty`, () => {
      const r = parseViatorListing(html, '')
      expect(r.fields.why_this).toBe('')
      expect(r.missing).toContain('why_this')
    }, 30_000)
  }
})

describe('option prices from the visible option blocks', () => {
  const options = (html: string) => {
    const r = parseViatorListing(html, 'https://www.viator.com/x')
    const parsed = parseOptions(r.fields.options)
    if (!parsed.ok) throw new Error(parsed.error)
    return { r, list: parsed.value }
  }

  it('viator-7: per-person prices from "2 Travelers x $X", dated with the tour date (Thu, Nov 26)', () => {
    const { r, list } = options(viator7)
    expect(list).toEqual([
      { name: 'Interior Tour-Scheduled Access', description: 'Priced for 2 travelers, Nov 26', price: 73.99 },
      { name: 'Sainte Chapelle + ND Exterior', description: 'Priced for 2 travelers, Nov 26', price: 135.45 },
    ])
    expect(r.missing).not.toContain('option_prices')
  })

  it('viator-6: per-person prices from "2 Adults x $X", current not struck price, dated Wed, Nov 25', () => {
    const { list } = options(viator6)
    expect(list).toEqual([
      { name: 'Semi Private Tour', description: 'Priced for 2 travelers, Nov 25', price: 95.2 },
      { name: 'Notre Dame de Paris: Private Guided Tour Guide', description: 'Priced for 2 travelers, Nov 25', price: 127.2 },
    ])
  })

  it('never uses the free-cancellation date in a block as the price date', () => {
    const all = [...options(viator6).list, ...options(viator7).list].map((o) => o.description ?? '')
    // viator-6 Semi Private says "on Nov 24"; viator-7 Interior says "on Nov 25". Both are deadlines.
    expect(all[0]).not.toContain('Nov 24')
    expect(options(viator7).list[0].description).not.toContain('Nov 25')
  })

  it('never stores the totals, the struck-through originals, or the page "from" price', () => {
    const prices = [...options(viator6).list, ...options(viator7).list].map((o) => o.price)
    for (const wrong of [190.4, 238, 254.4, 318, 119, 147.98, 270.9, 55.77]) {
      expect(prices).not.toContain(wrong)
    }
  })

  it('viator-6 and viator-7 are complete now that options have prices', () => {
    expect(parseViatorListing(viator6, '').status).toBe('complete')
    expect(parseViatorListing(viator7, '').status).toBe('complete')
  })

  const block = (n: number, inner: string) =>
    `<div data-automation="tour-grade-${n}"><label><span role="heading">Option ${n}</span></label>${inner}</div>`
  const pageWith = (blocks: string, ld?: object, pickedDate?: string) =>
    `<html><head>${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ''}</head><body>` +
    (pickedDate ? `<input data-automation="availability-date-picker-input" value="${pickedDate}">` : '') +
    `<div data-automation="tour-grade-list">${blocks}</div></body></html>`

  it('uses the first money value in tour-grade-price when there is no per-person line', () => {
    const { list } = options(pageWith(block(0, '<div data-automation="tour-grade-price"><span>€1,045.50</span></div>')))
    expect(list).toEqual([{ name: 'Option 0', description: null, price: 1045.5 }])
  })

  it('ignores a struck-through price that comes first', () => {
    const { list } = options(pageWith(block(0,
      '<div data-automation="tour-grade-price"><s>$80.00</s> <span>$64.00</span></div>')))
    expect(list[0].price).toBe(64)
  })

  it('leaves the price blank when a block has no tour-grade-price, even with a "from" price', () => {
    const ld = { '@type': 'Product', name: 'X', offers: { '@type': 'Offer', price: '28.45' } }
    const { r, list } = options(pageWith(
      block(0, '<div data-automation="tour-grade-price"><span>$50</span></div>') + block(1, '<p>Sold out</p>'),
      ld,
    ))
    expect(list).toEqual([
      { name: 'Option 0', description: null, price: 50 },
      { name: 'Option 1', description: null, price: null },
    ])
    expect(r.fields.options).not.toContain('28.45')
    expect(r.missing).toContain('option_prices')
  })

  it('does not read the traveler count out of a total that runs into it', () => {
    const { list } = options(pageWith(block(0,
      '<div data-automation="tour-grade-price"><span>$147.98</span></div><div><span>1 Traveler x $147.98</span></div>')))
    expect(list[0]).toEqual({ name: 'Option 0', description: 'Priced for 1 traveler', price: 147.98 })
  })

  it('keeps "Priced for N travelers" alone when no tour date is picked', () => {
    const { list } = options(pageWith(block(0,
      '<div data-automation="tour-grade-price"><span>$80.00</span></div><div><span>2 Adults x $40.00</span></div>' +
      '<p>Free cancellation before 9:00 AM on Dec 3 (local time)</p>')))
    expect(list[0].description).toBe('Priced for 2 travelers')
  })

  it('adds the picked tour date to every per-person description', () => {
    const priced = (n: number, total: string, each: string) =>
      block(n, `<div data-automation="tour-grade-price"><span>${total}</span></div><div><span>2 Adults x ${each}</span></div>`)
    const { list } = options(pageWith(priced(0, '$80.00', '$40.00') + priced(1, '$100.00', '$50.00'), undefined, 'Sat, Dec 5'))
    expect(list.map((o) => o.description)).toEqual(['Priced for 2 travelers, Dec 5', 'Priced for 2 travelers, Dec 5'])
  })

  it('does not add a date to options without a per-person line', () => {
    const { list } = options(pageWith(block(0, '<div data-automation="tour-grade-price"><span>$80.00</span></div>'), undefined, 'Sat, Dec 5'))
    expect(list[0]).toEqual({ name: 'Option 0', description: null, price: 80 })
  })

  it('ignores a per-person line in a block without tour-grade-price', () => {
    const { list } = options(pageWith(block(0, '<div><span>2 Adults x $40.00</span></div>')))
    expect(list[0].price).toBeNull()
  })
})

describe('parseViatorListing on small pages', () => {
  const page = (body: string, head = '') =>
    `<!doctype html><html><head>${head}</head><body>${body}</body></html>`

  it('prefers JSON-LD over visible elements', () => {
    const ld = {
      '@type': ['Product', 'TouristTrip'],
      name: 'From JSON-LD',
      aggregateRating: { ratingValue: 4.8, reviewCount: 12 },
      offers: [
        { '@type': 'Offer', name: 'Shared', price: '50' },
        { '@type': 'Offer', name: 'Private', price: '200' },
      ],
    }
    const r = parseViatorListing(
      page(
        '<h1 data-automation="product-title">From the page</h1>',
        `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
      ),
      'https://www.viator.com/x',
    )
    expect(r.fields.title).toBe('From JSON-LD')
    expect(r.fields.rating).toBe('4.8')
    expect(r.fields.review_count).toBe('12')
    expect(r.fields.options).toBe('Shared |  | 50\nPrivate |  | 200')
    expect(r.missing).not.toContain('option_prices')
  })

  it('falls back to visible elements and decodes entities', () => {
    const r = parseViatorListing(
      page(`
        <h1 data-automation="product-title">Seine &amp; Louvre Walk</h1>
        <ul data-automation="product-attributes-list"><li>3 hours (approx.)</li><li>Offered in: English, French</li></ul>
        <button data-automation="title-review-link"><div aria-label="Rated 4.5 out of 5"></div><span>1,204 Reviews</span></button>
        <h2>Reviews</h2><div>4.3</div><div>based on 1,204 reviews</div>
      `),
      'https://www.viator.com/x',
    )
    expect(r.fields.title).toBe('Seine & Louvre Walk')
    expect(r.fields.duration).toBe('3 hours (approx.)')
    expect(r.fields.languages).toBe('English, French')
    expect(r.fields.rating).toBe('4.3')
    expect(r.fields.review_count).toBe('1204')
    expect(r.fields.options).toBe('')
    expect(r.status).toBe('partial')
    expect(r.missing).toContain('options')
  })

  it('takes the visible one-decimal score over rounded JSON-LD and star icons', () => {
    const ld = { '@type': 'Product', name: 'X', aggregateRating: { ratingValue: 4.5, reviewCount: 283 } }
    const r = parseViatorListing(
      page(
        `<div data-automation="highlighted-reviews-shelf"><div><h2><span>Why travelers loved this</span></h2>
           <div><div><div></div><div>4.7</div><div>·<button><span>283 </span><span>Reviews</span></button></div></div></div></div></div>
         <button data-automation="title-review-link"><div aria-label="Rated 4.5 out of 5"></div><span>283 Reviews</span></button>`,
        `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
      ),
      'https://www.viator.com/x',
    )
    expect(r.fields.rating).toBe('4.7')
  })

  it('stores a whole-number score with one decimal', () => {
    const ld = { '@type': 'Product', name: 'X', aggregateRating: { ratingValue: 5, reviewCount: 3 } }
    const r = parseViatorListing(page('', `<script type="application/ld+json">${JSON.stringify(ld)}</script>`), '')
    expect(r.fields.rating).toBe('5.0')
  })

  it('reads a bulleted "Why Travelers Choose This Tour" list, one bullet per line', () => {
    const r = parseViatorListing(
      page(`<div data-automation="product-overview"><h2>Overview</h2><div><div><div>Intro.</div></div>
        <div><h3><span>Why Travelers Choose This Tour</span></h3>
          <ul><li>Small groups</li><li> Skip-the-line entry </li><li></li></ul></div></div></div>`),
      'https://www.viator.com/x',
    )
    expect(r.fields.why_this).toBe('Small groups\nSkip-the-line entry')
    expect(r.fields.overview).toBe('Intro.')
  })

  it('reads a why-this list written as lines with bullet characters', () => {
    const r = parseViatorListing(
      page(`<div data-automation="product-overview"><div><h3>Why Travellers Choose This Tour</h3>
        <div>• Expert guides<br>- Small groups<br><br>Great value</div></div></div>`),
      'https://www.viator.com/x',
    )
    expect(r.fields.why_this).toBe('Expert guides\nSmall groups\nGreat value')
  })

  it('falls back to the visible Overview text when JSON-LD has no description', () => {
    const r = parseViatorListing(
      page(`<div data-automation="product-overview"><h2>Overview</h2><div><div><div>One.<br><br>Two &amp; three.<br>Four.</div></div><ul></ul></div></div>`),
      'https://www.viator.com/x',
    )
    expect(r.fields.overview).toBe('One.\nTwo & three.\nFour.')
  })

  it('does not use review-theme tags as why_this', () => {
    const r = parseViatorListing(
      page(`<div data-automation="highlighted-reviews-shelf"><h2>Why travelers loved this</h2>
        <button data-automation="review-insights-filter-chip-1">All</button>
        <button data-automation="review-insights-filter-chip-2">Great guides</button>
        <button data-automation="review-insights-filter-chip-3">Family fun</button></div>`),
      'https://www.viator.com/x',
    )
    expect(r.fields.why_this).toBe('')
    expect(r.missing).toContain('why_this')
  })

  it('leaves a single option without a price even when the page has a "from" price', () => {
    const ld = { '@type': 'Product', name: 'X', offers: { '@type': 'Offer', price: '28.45', priceCurrency: 'USD' } }
    const state = { __PRELOADED_DATA__: { pageModel: { product: { tourGradeNames: { TG1: 'Only Option' } } } } }
    const r = parseViatorListing(
      page(
        `<script id="globalState" type="mime/invalid">${JSON.stringify(state)}</script>`,
        `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
      ),
      'https://www.viator.com/x',
    )
    expect(r.fields.options).toBe('Only Option')
    expect(r.fields.options).not.toContain('28.45')
    expect(r.missing).toContain('option_prices')
    expect(r.status).toBe('partial')
  })

  it('collapses tabs and non-breaking spaces in JSON-LD text', () => {
    const ld = { '@type': 'Product', name: 'Seine\u00A0\u00A0Walk\t\tTour' }
    const r = parseViatorListing(page('', `<script type="application/ld+json">${JSON.stringify(ld)}</script>`), '')
    expect(r.fields.title).toBe('Seine Walk Tour')
  })

  it('joins urgency messages without doubling punctuation', () => {
    const r = parseViatorListing(
      page(`<div data-automation="popularity-messages-wrapper"><span>Very popular!</span><span>10+ bookings in the past 6 hours.</span></div>`),
      'https://www.viator.com/x',
    )
    expect(r.fields.urgency_text).toBe('Very popular! 10+ bookings in the past 6 hours.')
  })

    it('reads a highlights list out of the description', () => {
    const ld = { '@type': 'Product', name: 'X', description: 'Intro<br /><br />Highlights:<br />- One<br />- Two<br /><br />After' }
    const r = parseViatorListing(
      page('', `<script type="application/ld+json">${JSON.stringify(ld)}</script>`),
      'https://www.viator.com/x',
    )
    expect(r.fields.highlights).toBe('One\nTwo')
  })

  it('ignores broken JSON-LD and never throws on junk', () => {
    expect(() => parseViatorListing('<script type="application/ld+json">{oops</script>', '')).not.toThrow()
    expect(parseViatorListing('not html at all', '').fields.title).toBe('')
  })
})

describe('computeStatus', () => {
  const base = {
    title: 'T', overview: '', duration: 'D', languages: 'English', group_type: '', highlights: '', inclusions: '',
    exclusions: '', why_this: '', itinerary: '', options: 'Shared |  | 40', rating: '4.7', review_count: '1',
    urgency_text: '',
  }

  it('is complete with title, duration, languages, rating, review count and a priced option', () => {
    expect(computeStatus(base)).toBe('complete')
  })

  it('is complete when only one of several options has a price', () => {
    expect(computeStatus({ ...base, options: 'Shared\nPrivate |  | 300' })).toBe('complete')
  })

  it('is partial when options exist but none has a price', () => {
    expect(computeStatus({ ...base, options: 'Shared\nPrivate' })).toBe('partial')
  })

  it('is partial when there are no options', () => {
    expect(computeStatus({ ...base, options: '  ' })).toBe('partial')
  })

  it('is partial when the options text is invalid', () => {
    expect(computeStatus({ ...base, options: 'Shared |  | cheap' })).toBe('partial')
  })

  it.each(['title', 'duration', 'languages', 'rating', 'review_count'] as const)(
    'is partial when %s is blank',
    (key) => {
      expect(computeStatus({ ...base, [key]: ' ' })).toBe('partial')
    },
  )

  it('does not need the non-core fields', () => {
    expect(computeStatus({ ...base, why_this: '', highlights: '', group_type: '', itinerary: '' })).toBe('complete')
  })
})
