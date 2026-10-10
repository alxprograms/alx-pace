import { describe, it, expect } from 'vitest'
import { pacingEvents } from './analytics'

/*
  The daily pacing snapshot. Program, week and status were three separate
  counts, so the dashboard could not say how many learners in Week 4 were
  behind. The fourth event carries the pair; the first three keep their names
  so the series collected since launch run on unbroken.
*/
describe('the daily pacing events', () => {
  it('names a Data Analytics learner’s week and status together, after the three it always sent', () => {
    expect(pacingEvents({ week: 4, status: 'behind' }, 'da')).toEqual([
      'program-da',
      'week-4',
      'status-behind',
      'week-4-behind',
    ])
  })

  it('prefixes the other programs, as their week events always were', () => {
    expect(pacingEvents({ week: 13.5, status: 'on-track' }, 'gd')).toEqual([
      'program-gd',
      'gd-week-13.5',
      'status-on-track',
      'gd-week-13.5-on-track',
    ])
  })

  it('treats a missing program as Data Analytics', () => {
    expect(pacingEvents({ week: 1, status: 'ahead' })[3]).toBe('week-1-ahead')
  })
})
