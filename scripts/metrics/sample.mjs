#!/usr/bin/env node
/**
 * A made-up metrics.json, for building and checking the dashboard before real
 * data exists:  node scripts/metrics/sample.mjs > metrics-data/metrics.json
 * (then /metrics/?data=/metrics-data/metrics.json under `npm run dev`).
 *
 *   --today 2026-11-20   as if collected that morning (default: today)
 *
 * Deterministic (seeded), and shaped like the real thing, events included:
 * the app has sent three sets of daily events (see readDay in
 * src/metrics/model.js), so the sample does too, and the dashboard is checked
 * against all three. A weekday rhythm, a cohort moving week by week through
 * Data Analytics, a pace mix, installed and browser opens. Never committed to
 * the `metrics` branch.
 */
import { addDays, buildFile, dayRange, STATUSES, todayUTC } from '../../src/metrics/model.js'
import { COLLECT_FROM } from '../../src/metrics/config.js'
import { stringifyFile } from './io.mjs'

const args = process.argv.slice(2)
const to = args.includes('--today') ? args[args.indexOf('--today') + 1] : todayUTC()

// When each set of events began (the third is this change's; a guess at its deploy).
const PROGRAM_FROM = '2026-10-04'
const SINGLE_FROM = '2026-10-12'
// Of the old pace events, sent fifth in a burst, the share GoatCounter let through.
const PACE_THROUGH = 0.04

let seed = 42
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32)
const days = {}
dayRange(COLLECT_FROM, to).forEach((day, i) => {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  const growth = Math.min(1, i / 45)
  const active = Math.round(4 + 40 * growth * (weekday === 0 || weekday === 6 ? 0.55 : 1) * (0.85 + rand() * 0.3))
  const counts = { '/': Math.round(active * 1.4) }
  const installed = Math.round(active * (0.15 + 0.3 * growth))
  counts['open-installed'] = installed
  counts['open-browser'] = Math.max(0, Math.round(active * 1.1) - installed)
  if (day >= PROGRAM_FROM && day < SINGLE_FROM) counts['program-da'] = active

  // The cohort's centre moves a week every seven days through the 14 weeks,
  // and a new cohort starts every 14 weeks.
  const centre = 1 + (Math.floor(i / 7) % 14)
  const mix = [0.3 + rand() * 0.1, 0.55, 0.1 + rand() * 0.05]
  let left = active
  for (let w = Math.max(1, centre - 3); w <= Math.min(14, centre + 1) && left > 0; w++) {
    const n = w === Math.min(14, centre + 1) ? left : Math.min(left, Math.round(active * (w === centre ? 0.45 : 0.18)))
    if (n <= 0) continue
    left -= n
    const behindBias = w < centre ? 0.35 : 0
    const parts = [Math.round(n * (mix[0] + behindBias)), 0, Math.round(n * mix[2] * (w > centre ? 3 : 1))]
    parts[1] = Math.max(0, n - parts[0] - parts[2])
    if (day >= SINGLE_FROM) {
      STATUSES.forEach((s, k) => parts[k] > 0 && (counts[`week-${w}-${s}`] = parts[k]))
    } else {
      counts[`week-${w}`] = n
      const through = day >= PROGRAM_FROM ? PACE_THROUGH : 1
      STATUSES.forEach((s, k) => {
        const kept = Math.round(parts[k] * through + (through < 1 && rand() < parts[k] * through % 1 ? 1 : 0))
        if (kept > 0) counts[`status-${s}`] = (counts[`status-${s}`] ?? 0) + kept
      })
    }
  }
  days[day] = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0))
})
process.stdout.write(stringifyFile(buildFile(days, { site: 'alxpace', updatedAt: `${addDays(to, 0)}T05:23:00Z` })))
