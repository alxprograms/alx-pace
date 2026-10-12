#!/usr/bin/env node
/**
 * Posts the weekly digest to Slack: last Friday to Thursday's visits,
 * learners, pace mix and busiest weeks, compared with the week before.
 *
 *   SLACK_WEBHOOK_URL=… node scripts/metrics/digest.mjs --dir metrics-data
 *   node scripts/metrics/digest.mjs --dir metrics-data --dry-run   # print, don't post
 *   … --today 2026-10-16                                           # as if run that day
 *   … --force                                                      # post even if posted
 *
 * Its day is West Africa's (model.todayWAT), so the run at 00:03 there on a
 * Friday (23:03 UTC on the Thursday) posts the week that has just ended. Run
 * again every morning after the collector, it posts each week once: on the
 * Friday, or on the first run after it when that one failed, was skipped or
 * ran late. The last week posted is kept in <dir>/digest.json, which the
 * workflow commits beside the numbers.
 *
 * With no webhook, or no data collected yet, it says so and exits 0.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { METRICS_FILE } from '../../src/metrics/config.js'
import { digestDue, readFile as readStored, todayWAT, weeklyDigest } from '../../src/metrics/model.js'
import { digestMessage } from '../../src/metrics/slack.js'

const args = process.argv.slice(2)
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const dir = opt('--dir', 'metrics-data')
const today = opt('--today', todayWAT())
const dryRun = args.includes('--dry-run')
const force = args.includes('--force') || process.env.FORCE === 'true'
const webhook = process.env.SLACK_WEBHOOK_URL
const postedPath = join(dir, 'digest.json')

const stored = readStored(await readFile(join(dir, METRICS_FILE), 'utf8').then(JSON.parse).catch(() => null))
if (!stored) {
  console.log('No metrics collected yet: no digest to send.')
  process.exit(0)
}

const digest = weeklyDigest(stored.days, today)
const posted = await readFile(postedPath, 'utf8').then((t) => JSON.parse(t).lastWeek).catch(() => null)
if (!dryRun && !digestDue(posted, digest, force)) {
  console.log(`The digest for the week of ${digest.from} was already posted.`)
  process.exit(0)
}

const message = digestMessage(digest)
if (dryRun || !webhook) {
  if (!webhook && !dryRun) console.log('SLACK_WEBHOOK_URL is not set: printing the digest instead of posting it.')
  console.log(JSON.stringify(message, null, 2))
  process.exit(0)
}

const res = await fetch(webhook, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(message),
})
if (!res.ok) {
  // Slack answers in plain text ("invalid_payload", "no_service"); the URL,
  // which is the secret, is never printed.
  console.error(`Slack refused the digest: ${res.status} ${(await res.text()).slice(0, 200)}`)
  process.exit(1)
}
await writeFile(postedPath, `${JSON.stringify({ lastWeek: digest.from, postedAt: new Date().toISOString() }, null, 2)}\n`)
console.log(`Posted: ${message.text}`)
