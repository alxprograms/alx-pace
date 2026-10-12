import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { buildFile, dayRange, todayWAT } from './model.js'

/*
  The Friday digest's schedule, end to end: the workflow's weekly cron, read
  from metrics.yml, fires at a moment whose West Africa day is a Friday, and
  digest.mjs run at that moment posts the Friday-to-Thursday week just ended.
  The model's tests cover the dates; this holds the wiring between the cron
  and the script's own day (todayWAT, not UTC's, which would post the week
  before at 23:03 UTC).
*/

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/metrics.yml'), 'utf8')
const CRONS = [...WORKFLOW.matchAll(/cron:\s*'([^']+)'/g)].map((m) => m[1].split(/\s+/))
const WEEKDAY = new Date(Date.UTC(2026, 9, 12)).getUTCDay() // Monday 12 Oct 2026

/** When a cron that names a weekday fires in the week of Monday 12 Oct 2026. */
function weeklyFire([minute, hour, , , weekday]) {
  const day = dayRange('2026-10-12', '2026-10-18').find((_, i) => (WEEKDAY + i) % 7 === Number(weekday))
  return `${day}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00Z`
}

describe('the Friday digest’s schedule', () => {
  const run = promisify(execFile)
  let dir

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'alx-digest-'))
    const days = Object.fromEntries(dayRange('2026-10-02', '2026-10-16').map((d) => [d, { '/': 3, 'week-4-on-track': 1 }]))
    await writeFile(join(dir, 'metrics.json'), JSON.stringify(buildFile(days, { site: 'alxpace', updatedAt: '2026-10-15T23:03:00Z' })))
  })

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  const digestAt = async (now) => {
    const { stdout } = await run(process.execPath, ['scripts/metrics/digest.mjs', '--dir', dir, '--dry-run', '--now', now], { cwd: ROOT })
    return JSON.parse(stdout).text
  }

  it('has one weekly run, just after midnight on a Friday in West Africa', () => {
    const weekly = CRONS.filter((c) => c[4] !== '*')
    expect(weekly).toHaveLength(1)
    const fire = weeklyFire(weekly[0])
    expect(new Date(`${todayWAT(new Date(fire))}T00:00:00Z`).getUTCDay()).toBe(5)
    // Within the first hour of that Friday there.
    expect(new Date(fire).getTime() - Date.parse(`${todayWAT(new Date(fire))}T00:00:00+01:00`)).toBeLessThan(3_600_000)
  })

  it('posts the week just ended from that run, and the same week from the morning run after it', async () => {
    const fire = weeklyFire(CRONS.find((c) => c[4] !== '*'))
    expect(await digestAt(fire)).toMatch(/^ALX Pace · Data Analytics · week of 9 Oct – 15 Oct 2026:/)
    const [minute, hour] = CRONS.find((c) => c[4] === '*')
    expect(await digestAt(`2026-10-16T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00Z`)).toMatch(/week of 9 Oct – 15 Oct 2026:/)
  })
})
