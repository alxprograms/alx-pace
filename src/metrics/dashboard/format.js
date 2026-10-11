/** Number and date formatting for the dashboard: plain, English, en-GB dates. */

export const fmtInt = (n) => Math.round(n).toLocaleString('en-GB')

/**
 * A number of learners. Learners are people, so it is whole, averages too
 * ("about 3 a day", never 2.9); one that would round to 0 although learners
 * were counted reads "<1".
 */
export const fmtLearners = (n) => (n > 0 && n < 0.5 ? '<1' : fmtInt(n))

export const fmtPct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`)

export const fmtDay = (day, opts = { day: 'numeric', month: 'short' }) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts })

/** A signed change for a stat tile, or null with nothing to compare. */
export function fmtChange(x) {
  if (x == null || !Number.isFinite(x)) return null
  const p = Math.round(x * 100)
  return { text: p === 0 ? 'level' : `${p > 0 ? '↑' : '↓'} ${Math.abs(p)}%`, up: p > 0, level: p === 0 }
}

/**
 * A count axis for values up to `dataMax`: whole-number steps of 1, 2 or 5
 * times a power of ten, about four of them, and a top that is a step.
 */
export function axis(dataMax) {
  const top = dataMax > 0 ? dataMax : 4
  const rough = top / 4
  const exp = 10 ** Math.floor(Math.log10(rough))
  const step = Math.max(1, [1, 2, 5, 10].map((f) => f * exp).find((v) => v >= rough))
  const max = Math.max(step, Math.ceil(top / step) * step)
  const ticks = []
  for (let v = 0; v <= max; v += step) ticks.push(v)
  return { max, ticks }
}
