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

  // Visits first: GoatCounter's own number, every visit since counting
  // began, as its page shows over all its days; then the week's share.
  const since = d.since ? fmtDay(d.since, { day: 'numeric', month: 'short', year: 'numeric' }) : null
  const total = since ? `*${fmtInt(d.visitsTotal)}* visits on GoatCounter so far, since counting began on ${since}` : null

  if (!d.hasData) {
    return {
      text: `${title}: no learner activity was counted.`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: title } },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              'No learner activity was counted this week. If the app was used, check the metrics job in GitHub Actions.',
              ...(total && d.visitsTotal > 0 ? [total] : []),
            ].join('\n'),
          },
        },
        link(d),
      ],
    }
  }

  // Every number is a count, never an average: learners are people.
  const headline = [
    total,
    // GoatCounter's "N out of M visits shown": its top 10 paths, out of them all.
    d.visitsTotalShown < d.visitsTotal && `${fmtInt(d.visitsTotalShown)} out of ${fmtInt(d.visitsTotal)} visits shown, as GoatCounter lists its top 10 paths`,
    `*${fmtInt(d.visits)}* of them this week (${signed(d.visitsChange)})`,
    `*${fmtInt(d.learnerDays)}* learner-days this week: each learner counted once for each day they opened Pace (${signed(d.learnerDaysChange)})`,
  ]
    .filter(Boolean)
    .join('\n')
  const pace = STATUS_LINE(d.status, d.statusShare)
  const busiest = d.topWeeks.length ? d.topWeeks.map((w) => `${weekLabel(w.week)}: ${fmtInt(w.learnerDays)}`).join(' · ') : '–'
  const peakLearners = `${fmtInt(d.peak?.active ?? 0)} ${d.peak?.active === 1 ? 'learner' : 'learners'}`
  const peak = !d.peak
    ? '–'
    : d.peakDays > 1
      ? `${peakLearners}, on ${d.peakDays} days`
      : `${fmtDay(d.peak.day, { weekday: 'long', day: 'numeric', month: 'short' })}, ${peakLearners}`

  return {
    text: `${title}: ${fmtInt(d.visitsTotal)} visits so far (${fmtInt(d.visits)} this week), ${fmtInt(d.learnerDays)} learner-days`,
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
            text: `Visits are every page view and event GoatCounter recorded, counted from ${since} to the end of this week; a learner-day is one learner on one day they opened Pace. The dashboard explains both. Learners who opt out of tracking are not counted.`,
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
