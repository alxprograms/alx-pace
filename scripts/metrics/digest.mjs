#!/usr/bin/env node
/**
 * Posts the Monday digest to Slack: last Monday to Sunday's active learners,
 * pace mix and busiest weeks, compared with the week before.
 *
 *   SLACK_WEBHOOK_URL=… node scripts/metrics/digest.mjs --dir metrics-data
 *   node scripts/metrics/digest.mjs --dir metrics-data --dry-run   # print, don't post
 *   … --today 2026-10-12                                           # as if run that day
 *
 * With no webhook, or no data collected yet, it says so and exits 0.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { METRICS_FILE } from '../../src/metrics/config.js'
import { readFile as readStored, todayUTC, weeklyDigest } from '../../src/metrics/model.js'
import { digestMessage } from '../../src/metrics/slack.js'

const args = process.argv.slice(2)
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const dir = opt('--dir', 'metrics-data')
const today = opt('--today', todayUTC())
const dryRun = args.includes('--dry-run')
const webhook = process.env.SLACK_WEBHOOK_URL

const stored = readStored(await readFile(join(dir, METRICS_FILE), 'utf8').then(JSON.parse).catch(() => null))
if (!stored) {
  console.log('No metrics collected yet: no digest to send.')
  process.exit(0)
}

const message = digestMessage(weeklyDigest(stored.days, today))
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
console.log(`Posted: ${message.text}`)
