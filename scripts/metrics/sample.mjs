#!/usr/bin/env node
/**
 * A made-up metrics.json, for building and checking the dashboard before real
 * data exists:  node scripts/metrics/sample.mjs > metrics-data/metrics.json
 * (then /metrics/?data=/metrics-data/metrics.json under `npm run dev`).
 *
 * Deterministic (seeded), shaped like the real thing: a launch in September,
 * weekday rhythm, a cohort moving week by week through Data Analytics, a pace
 * mix, installed and browser opens, and the combined week-and-pace events
 * from 1 October on. Never committed to the `metrics` branch.
 */
import { addDays, buildFile, dayRange, STATUSES, todayUTC } from '../../src/metrics/model.js'
import { stringifyFile } from './io.mjs'

let seed = 42
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32)
const from = '2026-09-01'
const to = todayUTC()
const days = {}
dayRange(from, to).forEach((day, i) => {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  const growth = Math.min(1, i / 30)
  const base = 6 + 40 * growth * (weekday === 0 || weekday === 6 ? 0.55 : 1) * (0.85 + rand() * 0.3)
  const active = Math.round(base)
  if (!active) return
  const counts = { 'program-da': active, '/': Math.round(active * 1.4) }
  const installed = Math.round(active * (0.2 + 0.25 * growth))
  counts['open-installed'] = installed
  counts['open-browser'] = Math.max(0, Math.round(active * 1.1) - installed)
  // The cohort's centre moves a week every seven days, from Week 1.
  const centre = 1 + Math.floor(i / 7)
  const mix = [0.3 + rand() * 0.1, 0.55, 0.1 + rand() * 0.05]
  let left = active
  for (let w = Math.max(1, centre - 3); w <= Math.min(14, centre + 1) && left > 0; w++) {
    const n = w === Math.min(14, centre + 1) ? left : Math.min(left, Math.round(active * (w === centre ? 0.45 : 0.18)))
    if (n <= 0) continue
    counts[`week-${w}`] = n
    left -= n
    if (day >= '2026-10-01') {
      const behindBias = w < centre ? 0.35 : 0
      const parts = [Math.round(n * (mix[0] + behindBias)), 0, Math.round(n * mix[2] * (w > centre ? 3 : 1))]
      parts[1] = Math.max(0, n - parts[0] - parts[2])
      STATUSES.forEach((s, k) => parts[k] > 0 && (counts[`week-${w}-${s}`] = parts[k]))
    }
  }
  const behind = Math.round(active * mix[0])
  const ahead = Math.round(active * mix[2])
  counts['status-behind'] = behind
  counts['status-ahead'] = ahead
  counts['status-on-track'] = Math.max(0, active - behind - ahead)
  days[day] = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0))
})
process.stdout.write(stringifyFile(buildFile(days, { site: 'alxpace', updatedAt: `${addDays(to, 0)}T05:23:00Z` })))
