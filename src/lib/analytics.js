import { GOATCOUNTER_SITE } from './analyticsConfig'

/**
 * Anonymous, cookieless usage tallies via GoatCounter's pixel API.
 *
 * Deliberately NOT the vendor <script>: we fire plain GET beacons ourselves,
 * so no third-party code ever executes in the app, nothing is stored on the
 * device for tracking, and the beacon silently no-ops offline. Aggregate
 * counts only — no ids, no names, nothing that can identify a learner.
 */

function enabled() {
  return (
    Boolean(GOATCOUNTER_SITE) &&
    import.meta.env.PROD &&
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !navigator.webdriver &&
    navigator.doNotTrack !== '1' &&
    !navigator.globalPrivacyControl
  )
}

function send(path, { event = true } = {}) {
  if (!enabled()) return
  try {
    const params = new URLSearchParams({
      p: path,
      e: event ? 'true' : 'false',
      rnd: String(Date.now()),
    })
    fetch(`https://${GOATCOUNTER_SITE}.goatcounter.com/count?${params}`, {
      mode: 'no-cors',
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {})
  } catch {
    /* analytics must never break the app */
  }
}

/** One pageview per app open, plus how the app is running. */
export function trackAppOpen() {
  send('/', { event: false })
  const standalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true // iOS Safari
  send(standalone ? 'open-installed' : 'open-browser')
}

/**
 * The events of one daily pacing snapshot, in the order they are sent.
 *
 * Program, week and status each count learners on their own, so the
 * dashboard can say how many are in Week 4 and how many are behind, but not
 * how many in Week 4 are behind. The fourth event carries the pair
 * (`week-4-behind`), so that question has an answer from the day it ships;
 * the first three are unchanged, and every series already collected runs on.
 * DA keeps its bare `week-N` names; other programs prefix theirs
 * (`cc-week-N`, `cc-week-N-behind`).
 */
export function pacingEvents(paceStatus, program = 'da') {
  const week = program === 'da' ? `week-${paceStatus.week}` : `${program}-week-${paceStatus.week}`
  return [`program-${program}`, week, `status-${paceStatus.status}`, `${week}-${paceStatus.status}`]
}

/**
 * Aggregate pacing snapshot — at most once per device per calendar day, so
 * the dashboard reads as "daily active learners in program P / at week N /
 * status X / at week N with status X" (see pacingEvents).
 */
export function trackPacingDaily(paceStatus, program = 'da') {
  if (!enabled() || !paceStatus) return
  try {
    const today = new Date().toDateString()
    if (window.localStorage.getItem('alx-metrics-day') === today) return
    window.localStorage.setItem('alx-metrics-day', today)
  } catch {
    return // storage unavailable — skip rather than over-count
  }
  for (const event of pacingEvents(paceStatus, program)) send(event)
}
