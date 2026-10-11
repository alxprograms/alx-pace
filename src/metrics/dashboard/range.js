import { addDays, daysBetween, isDay } from '../model.js'

/*
  What the dashboard is showing: a preset (the last 7, 30 or 90 days, or
  everything) or days picked by date, from and to (the same day for one day).
  It lives in the page's address, so a link opens the same view, and the
  Slack digest's button opens its own week.
*/

export const PRESETS = [7, 30, 90, 'all']
export const DEFAULT_SELECTION = { preset: 30 }

/**
 * A selection made into days on record: never before the first day, never
 * after the last complete one, and `from` never after `to`.
 */
export function resolveRange(selection, first, last) {
  const clamp = (d) => (d < first ? first : d > last ? last : d)
  if (selection.preset) {
    const asked = selection.preset === 'all' ? first : addDays(last, -(selection.preset - 1))
    const from = clamp(asked)
    return { from, to: last, length: daysBetween(from, last) + 1, preset: selection.preset }
  }
  const from = clamp(selection.from)
  const to = clamp(selection.to < from ? from : selection.to)
  return { from, to, length: daysBetween(from, to) + 1, preset: null }
}

/** The selection a page address asks for: ?from=&to= days, or ?range=7|30|90|all. */
export function selectionFromSearch(search) {
  const params = new URLSearchParams(search)
  const from = params.get('from')
  if (isDay(from)) {
    const to = params.get('to')
    return { from, to: isDay(to) && to >= from ? to : from }
  }
  const preset = PRESETS.find((p) => String(p) === params.get('range'))
  return preset ? { preset } : DEFAULT_SELECTION
}

/** The page address for a selection, keeping any other parameters it has. */
export function searchForSelection(selection, search = '') {
  const params = new URLSearchParams(search)
  for (const key of ['from', 'to', 'range']) params.delete(key)
  if (selection.preset) {
    if (selection.preset !== DEFAULT_SELECTION.preset) params.set('range', String(selection.preset))
  } else {
    params.set('from', selection.from)
    if (selection.to !== selection.from) params.set('to', selection.to)
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/**
 * A new `from` or `to` picked in the date boxes. A `from` picked over a preset
 * is a single day; otherwise the other end stays, unless it would end up on
 * the wrong side, when it moves to meet the new one.
 */
export function pickDate(view, end, day) {
  if (!isDay(day)) return null
  if (end === 'from') return { from: day, to: view.preset || view.to < day ? day : view.to }
  return { from: view.from > day ? day : view.from, to: day }
}

export const CONTEXT_DAYS = 14

/**
 * The days the day-by-day charts show. A range of a week or more is its own
 * days. A shorter one would leave a column or two on their own, so the charts
 * show the two weeks around it (as many as are on record), and mark which of
 * them were picked.
 */
export function chartWindow(view, first, last) {
  if (view.length >= 7) return { from: view.from, to: view.to, context: false }
  let from = addDays(view.from, -Math.floor((CONTEXT_DAYS - view.length) / 2))
  let to = addDays(from, CONTEXT_DAYS - 1)
  if (to > last) {
    from = addDays(from, -daysBetween(last, to))
    to = last
  }
  if (from < first) {
    to = addDays(to, daysBetween(from, first))
    from = first
    if (to > last) to = last
  }
  return { from, to, context: true }
}
