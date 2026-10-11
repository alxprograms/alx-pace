import { describe, it, expect } from 'vitest'
import { chartWindow, pickDate, resolveRange, searchForSelection, selectionFromSearch } from './range.js'

const FIRST = '2026-07-20'
const LAST = '2026-10-10'

describe('what a selection covers', () => {
  it('takes a preset back from the last complete day, never before the first', () => {
    expect(resolveRange({ preset: 7 }, FIRST, LAST)).toEqual({ from: '2026-10-04', to: LAST, length: 7, preset: 7 })
    expect(resolveRange({ preset: 90 }, '2026-09-01', LAST).from).toBe('2026-09-01')
    expect(resolveRange({ preset: 'all' }, FIRST, LAST)).toMatchObject({ from: FIRST, length: 83 })
  })

  it('shows one day, or days picked, inside what is on record', () => {
    expect(resolveRange({ from: '2026-10-09', to: '2026-10-09' }, FIRST, LAST)).toEqual({ from: '2026-10-09', to: '2026-10-09', length: 1, preset: null })
    expect(resolveRange({ from: '2026-07-01', to: '2026-12-01' }, FIRST, LAST)).toMatchObject({ from: FIRST, to: LAST })
    // A link to days not collected yet opens the last day there is.
    expect(resolveRange({ from: '2026-11-02', to: '2026-11-08' }, FIRST, LAST)).toMatchObject({ from: LAST, to: LAST, length: 1 })
  })
})

describe('the selection in the page address', () => {
  it('reads days, a preset, or the default', () => {
    expect(selectionFromSearch('?from=2026-10-05&to=2026-10-11')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(selectionFromSearch('?from=2026-10-09')).toEqual({ from: '2026-10-09', to: '2026-10-09' })
    expect(selectionFromSearch('?from=2026-10-09&to=2026-10-01')).toEqual({ from: '2026-10-09', to: '2026-10-09' })
    expect(selectionFromSearch('?range=all')).toEqual({ preset: 'all' })
    expect(selectionFromSearch('?range=7')).toEqual({ preset: 7 })
    expect(selectionFromSearch('?from=2026-02-30&range=12')).toEqual({ preset: 30 })
    expect(selectionFromSearch('')).toEqual({ preset: 30 })
  })

  it('writes it back, keeping other parameters, and the default as no parameters', () => {
    expect(searchForSelection({ from: '2026-10-05', to: '2026-10-11' })).toBe('?from=2026-10-05&to=2026-10-11')
    expect(searchForSelection({ from: '2026-10-09', to: '2026-10-09' }, '?range=7')).toBe('?from=2026-10-09')
    expect(searchForSelection({ preset: 90 }, '?data=%2Fx.json&from=2026-10-09')).toBe('?data=%2Fx.json&range=90')
    expect(searchForSelection({ preset: 30 }, '?range=7')).toBe('')
  })
})

describe('picking dates', () => {
  const preset = { from: '2026-09-11', to: LAST, preset: 30 }
  const days = { from: '2026-10-05', to: '2026-10-08', preset: null }

  it('makes a from picked over a preset a single day', () => {
    expect(pickDate(preset, 'from', '2026-10-09')).toEqual({ from: '2026-10-09', to: '2026-10-09' })
  })

  it('keeps the other end of picked days, unless it would end up on the wrong side', () => {
    expect(pickDate(days, 'from', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-08' })
    expect(pickDate(days, 'from', '2026-10-09')).toEqual({ from: '2026-10-09', to: '2026-10-09' })
    expect(pickDate(days, 'to', '2026-10-10')).toEqual({ from: '2026-10-05', to: '2026-10-10' })
    expect(pickDate(days, 'to', '2026-10-02')).toEqual({ from: '2026-10-02', to: '2026-10-02' })
    expect(pickDate(preset, 'to', '2026-10-01')).toEqual({ from: '2026-09-11', to: '2026-10-01' })
  })

  it('ignores a date box left half typed', () => {
    expect(pickDate(days, 'from', '')).toBeNull()
  })
})

describe('the days the charts show', () => {
  it('shows a week or more as it is', () => {
    expect(chartWindow({ from: '2026-10-04', to: LAST, length: 7 }, FIRST, LAST)).toEqual({ from: '2026-10-04', to: LAST, context: false })
  })

  it('shows one day amid the two weeks around it, as many as are on record', () => {
    expect(chartWindow({ from: '2026-09-15', to: '2026-09-15', length: 1 }, FIRST, LAST)).toEqual({ from: '2026-09-09', to: '2026-09-22', context: true })
    // Near the last day: the two weeks before it instead.
    expect(chartWindow({ from: '2026-10-09', to: '2026-10-09', length: 1 }, FIRST, LAST)).toEqual({ from: '2026-09-27', to: LAST, context: true })
    // Near the first day: the two weeks after it.
    expect(chartWindow({ from: '2026-07-21', to: '2026-07-22', length: 2 }, FIRST, LAST)).toEqual({ from: FIRST, to: '2026-08-02', context: true })
    // Less than two weeks on record: all of it.
    expect(chartWindow({ from: '2026-10-09', to: '2026-10-09', length: 1 }, '2026-10-05', LAST)).toEqual({ from: '2026-10-05', to: LAST, context: true })
  })
})
