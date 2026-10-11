/**
 * The Monday Slack digest, as a Slack incoming-webhook payload (Block Kit).
 *
 * Plain numbers and words: Slack draws no charts from a webhook, so the link
 * at the end opens the dashboard for those. `text` is the notification line
 * and the fallback for clients that cannot show blocks.
 */
import { DASHBOARD_URL } from './config.js'

const fmtInt = (n) => Math.round(n).toLocaleString('en-GB')

const PROGRAM_NAMES = { da: 'Data Analytics', cc: 'Content Creation', gd: 'Graphic Design' }

const fmtDay = (day, opts) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts })
const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`)
const signed = (x) => {
  if (x == null) return 'no earlier week to compare'
  const p = Math.round(x * 100)
  return p === 0 ? 'level with the week before' : `${p > 0 ? '↑' : '↓'} ${Math.abs(p)}% on the week before`
}
const weekLabel = (w) => `Week ${w}`

/** The webhook payload for a digest from model.weeklyDigest. */
export function digestMessage(d) {
  const range = `${fmtDay(d.from, { day: 'numeric', month: 'short' })} – ${fmtDay(d.to, { day: 'numeric', month: 'short', year: 'numeric' })}`
  const program = PROGRAM_NAMES[d.program] ?? d.program
  const title = `ALX Pace · ${program} · week of ${range}`

  if (!d.hasData) {
    return {
      text: `${title}: no learner activity was counted.`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: title } },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'No learner activity was counted this week. If the app was used, check the metrics job in GitHub Actions.',
          },
        },
        link(d),
      ],
    }
  }

  // Visits first: GoatCounter's own number, the one its dashboard shows.
  // Every number is a count, never an average: learners are people.
  const headline = [
    `*${fmtInt(d.visits)}* visits on GoatCounter (${signed(d.visitsChange)})`,
    `*${fmtInt(d.learnerDays)}* learner-days: each learner counted once for each day they opened Pace (${signed(d.learnerDaysChange)})`,
  ].join('\n')
  const pace = STATUS_LINE(d.status, d.statusShare)
  const busiest = d.topWeeks.length ? d.topWeeks.map((w) => `${weekLabel(w.week)}: ${fmtInt(w.learnerDays)}`).join(' · ') : '–'
  const peakLearners = `${fmtInt(d.peak?.active ?? 0)} ${d.peak?.active === 1 ? 'learner' : 'learners'}`
  const peak = !d.peak
    ? '–'
    : d.peakDays > 1
      ? `${peakLearners}, on ${d.peakDays} days`
      : `${fmtDay(d.peak.day, { weekday: 'long', day: 'numeric', month: 'short' })}, ${peakLearners}`

  return {
    text: `${title}: ${fmtInt(d.visits)} visits, ${fmtInt(d.learnerDays)} learner-days`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: title } },
      { type: 'section', text: { type: 'mrkdwn', text: headline } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Pace*\n${pace}` },
          { type: 'mrkdwn', text: `*Busiest day*\n${peak}` },
          { type: 'mrkdwn', text: `*Where learners are* (learner-days)\n${busiest}` },
          { type: 'mrkdwn', text: `*App opens*\n${fmtInt(d.installed + d.browser)} · ${fmtInt(d.installed)} from the installed app (${pct(d.installedShare)})` },
        ],
      },
      link(d),
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Visits are every page view and event GoatCounter recorded; a learner-day is one learner on one day they opened Pace. The dashboard explains both. Learners who opt out of tracking are not counted.',
          },
        ],
      },
    ],
  }
}

const STATUS_LINE = (counts, shares) =>
  [['on-track', 'On track'], ['behind', 'Behind'], ['ahead', 'Ahead']]
    .map(([k, label]) => `${label} ${fmtInt(counts[k])} (${pct(shares[k])})`)
    .join(' · ')

/** The dashboard, opened on the digest's week. */
const link = (d) => ({
  type: 'actions',
  elements: [
    {
      type: 'button',
      text: { type: 'plain_text', text: 'Open the dashboard' },
      url: `${DASHBOARD_URL}?from=${d.from}&to=${d.to}`,
    },
  ],
})
