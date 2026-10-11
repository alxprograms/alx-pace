// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DailyActiveChart } from './charts.jsx'
import { DateBox, SETTLE_MS } from './Dashboard.jsx'

/*
  Picking days on the dashboard, as a browser delivers it: keys and changes
  in a date box, presses on a chart. Each case here was a review finding.
*/

let container
let root
const WIDTH = 600

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
  }
  // jsdom lays nothing out: give the charts a width to draw in.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WIDTH)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const render = (el) => act(() => root.render(el))
const setValue = (input, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
/** A key press that changes the box, as typing a digit into one of its parts does. */
const type = (input, value) =>
  act(() => {
    key(input, value.at(-1))
    setValue(input, value)
  })

describe('a date box', () => {
  const box = (props) => <DateBox label="To" value="2026-09-20" min="2026-07-20" max="2026-10-10" {...props} />

  it('waits for typing to rest: the 2nd, passed on the way to the 28th, is never taken', () => {
    const onPick = vi.fn()
    render(box({ onPick }))
    const input = container.querySelector('input')
    act(() => input.focus())
    type(input, '2026-09-02')
    act(() => vi.advanceTimersByTime(300))
    type(input, '2026-09-28')
    act(() => vi.advanceTimersByTime(SETTLE_MS - 1))
    expect(onPick).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onPick.mock.calls).toEqual([['2026-09-28']])
  })

  it('takes a date from the calendar at once, and a typed one on Enter or on leaving', () => {
    const onPick = vi.fn()
    render(box({ onPick }))
    const input = container.querySelector('input')
    act(() => vi.advanceTimersByTime(5000))
    act(() => setValue(input, '2026-09-25'))
    expect(onPick.mock.calls).toEqual([['2026-09-25']])

    act(() => input.focus())
    type(input, '2026-09-03')
    act(() => key(input, 'Enter'))
    expect(onPick.mock.calls.at(-1)).toEqual(['2026-09-03'])

    type(input, '2026-09-04')
    act(() => input.blur())
    expect(onPick.mock.calls.at(-1)).toEqual(['2026-09-04'])
    act(() => vi.advanceTimersByTime(SETTLE_MS))
    expect(onPick).toHaveBeenCalledTimes(3)
  })

  it('takes the date already in it on Enter, so a preset’s first day can be had alone', () => {
    const onPick = vi.fn()
    render(box({ onPick }))
    act(() => key(container.querySelector('input'), 'Enter'))
    expect(onPick.mock.calls).toEqual([['2026-09-20']])
  })

  it('shows the page’s date again on Back, even mid-edit, and drops the edit', () => {
    const onPick = vi.fn()
    render(box({ onPick, moved: 0 }))
    const input = container.querySelector('input')
    act(() => input.focus())
    type(input, '2026-09-01')
    render(box({ onPick, moved: 1, value: '2026-09-25' }))
    expect(input.value).toBe('2026-09-25')
    act(() => vi.advanceTimersByTime(SETTLE_MS))
    expect(onPick).not.toHaveBeenCalled()
  })
})

describe('picking a day on a chart', () => {
  const days = (from, n) =>
    Array.from({ length: n }, (_, i) => {
      const day = new Date(Date.UTC(2026, 8, from + i)).toISOString().slice(0, 10)
      return { day, active: i + 1, status: {}, weeks: {}, weekStatus: {} }
    })
  const chart = (rows, onPick) => <DailyActiveChart rows={rows} label="Active learners per day" onPick={onPick} />
  const group = () => container.querySelector('[role=group]')
  const live = () => container.querySelector('[aria-live]').textContent
  /** A press on column i, by mouse or by finger. */
  const press = (rows, i, pointerType) =>
    act(() => {
      const band = (WIDTH - 34 - 16) / rows.length
      const at = { bubbles: true, clientX: 34 + band * (i + 0.5), clientY: 100 }
      const down = new MouseEvent('pointerdown', at)
      Object.defineProperty(down, 'pointerType', { value: pointerType })
      group().dispatchEvent(down)
      group().dispatchEvent(new MouseEvent('click', at))
    })

  it('forgets the day in hand when the days shown change, so a second Enter picks nothing', () => {
    const onPick = vi.fn()
    const month = days(11, 30)
    render(chart(month, onPick))
    act(() => key(group(), 'End'))
    act(() => key(group(), 'Enter'))
    expect(onPick.mock.calls).toEqual([['2026-10-10']])
    // The page now shows the two weeks around 10 Oct: 14 columns, not 30.
    render(chart(days(27, 14), onPick))
    expect(live()).toBe('')
    expect(() => act(() => key(group(), 'Enter'))).not.toThrow()
    expect(onPick).toHaveBeenCalledTimes(1)
    // The arrows start again from the first day, not from column 30.
    act(() => key(group(), 'ArrowRight'))
    expect(live()).toMatch(/^Sun,? 27 Sept: 1 learner that day/)
  })

  it('picks on a mouse click, but on a touch screen only on a second tap', () => {
    const onPick = vi.fn()
    const month = days(11, 30)
    render(chart(month, onPick))
    press(month, 4, 'mouse')
    expect(onPick.mock.calls).toEqual([['2026-09-15']])

    render(chart(days(1, 30), onPick))
    const other = days(1, 30)
    press(other, 4, 'touch')
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(live()).toContain('5 Sept')
    press(other, 4, 'touch')
    expect(onPick.mock.calls.at(-1)).toEqual(['2026-09-05'])
  })
})
