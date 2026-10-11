// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { pacingEvents, trackAppOpen, trackPacingDaily } from './analytics'

/*
  The daily pacing snapshot. Program, week and pace used to be separate
  events, so the counts could not say how many learners in Week 4 were
  behind, and the first open sent 5 hits in a burst, over GoatCounter's
  published limit of 4 a second from one device. One event now carries week
  and pace together.
*/
describe('the daily pacing events', () => {
  it('names a Data Analytics learner’s week and pace in one event', () => {
    expect(pacingEvents({ week: 4, status: 'behind' }, 'da')).toEqual(['week-4-behind'])
  })

  it('prefixes the other programs, as their week events always were', () => {
    expect(pacingEvents({ week: 13.5, status: 'on-track' }, 'gd')).toEqual(['gd-week-13.5-on-track'])
  })

  it('treats a missing program as Data Analytics', () => {
    expect(pacingEvents({ week: 1, status: 'ahead' })).toEqual(['week-1-ahead'])
  })
})

describe('what the first open of a day sends', () => {
  let hits

  beforeEach(() => {
    hits = []
    vi.stubEnv('PROD', true)
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        hits.push(new URL(url))
        return Promise.resolve()
      }),
    )
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('stays within GoatCounter’s 4 hits a second, all in one burst', () => {
    trackAppOpen()
    trackPacingDaily({ week: 4, status: 'behind' }, 'da')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.length).toBeLessThanOrEqual(4)
    expect(hits.map((u) => u.searchParams.get('p'))).toEqual(['/', 'open-browser', 'week-4-behind'])
  })

  it('counts every daily hit, since the app sends it once a day itself', () => {
    trackAppOpen()
    trackPacingDaily({ week: 4, status: 'behind' }, 'da')
    const byPath = Object.fromEntries(hits.map((u) => [u.searchParams.get('p'), u.searchParams.get('ns')]))
    expect(byPath['week-4-behind']).toBe('true')
    // Opens stay GoatCounter visits: a learner reopening the app is one visit.
    expect(byPath['/']).toBeNull()
    expect(byPath['open-browser']).toBeNull()
  })

  it('sends the daily snapshot once a day', () => {
    trackPacingDaily({ week: 4, status: 'behind' }, 'da')
    trackPacingDaily({ week: 4, status: 'behind' }, 'da')
    expect(hits).toHaveLength(1)
  })
})
