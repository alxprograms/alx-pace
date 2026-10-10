#!/usr/bin/env node
/**
 * Collects learner-usage counts from GoatCounter into metrics.json.
 *
 *   GOATCOUNTER_API_KEY=… node scripts/metrics/collect.mjs --dir metrics-data
 *
 * Reads <dir>/metrics.json if there is one, fetches the last REFETCH_DAYS days
 * again (or everything since COLLECT_FROM on the first run), lays them over
 * what is stored and writes the file back. Run daily by
 * .github/workflows/metrics.yml, which commits the file to the `metrics` branch.
 *
 * With no API key it says so and exits 0: until the owner adds the secret, the
 * scheduled job is a no-op rather than a red run every morning.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { COLLECT_FROM, GOATCOUNTER_SITE, METRICS_FILE, REFETCH_DAYS } from '../../src/metrics/config.js'
import { addDays, buildFile, hitsToDays, mergeDays, readFile as readStored, todayUTC } from '../../src/metrics/model.js'
import { fetchDailyHits } from '../../src/metrics/goatcounter.js'
import { stringifyFile } from './io.mjs'

const args = process.argv.slice(2)
const dir = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : 'metrics-data'
const token = process.env.GOATCOUNTER_API_KEY
const site = process.env.GOATCOUNTER_SITE || GOATCOUNTER_SITE

if (!token) {
  console.log('GOATCOUNTER_API_KEY is not set: nothing collected. Add it as a repository secret to start.')
  process.exit(0)
}

const path = join(dir, METRICS_FILE)
const stored = readStored(await readFile(path, 'utf8').then(JSON.parse).catch(() => null))
const to = todayUTC()
const from = stored?.lastDay
  ? [addDays(stored.lastDay, -REFETCH_DAYS), COLLECT_FROM].sort().at(-1)
  : COLLECT_FROM

console.log(`Fetching ${site} from ${from} to ${to}${stored ? ` (stored up to ${stored.lastDay})` : ' (nothing stored yet)'}`)
const hits = await fetchDailyHits({ site, token, from, to })
const days = mergeDays(stored?.days, hitsToDays(hits, from, to))
const file = buildFile(days, { site, updatedAt: new Date().toISOString() })

await mkdir(dir, { recursive: true })
await writeFile(path, stringifyFile(file))
const last = file.days[addDays(to, -1)] ?? {}
console.log(`${hits.length} paths, ${Object.keys(file.days).length} days stored. Yesterday: ${last['program-da'] ?? 0} active Data Analytics learners.`)
