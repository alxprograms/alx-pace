import { describe, it, expect } from 'vitest'
import { fmtLearners } from './format.js'

describe('learner numbers', () => {
  it('are whole, because learners are people, averages included', () => {
    expect(fmtLearners(2.857)).toBe('3')
    expect(fmtLearners(39.3)).toBe('39')
    expect(fmtLearners(1284.6)).toBe('1,285')
    expect(fmtLearners(0)).toBe('0')
  })

  it('read "<1" when learners were counted but the average would round to 0', () => {
    expect(fmtLearners(0.2)).toBe('<1')
    expect(fmtLearners(0.5)).toBe('1')
  })
})
