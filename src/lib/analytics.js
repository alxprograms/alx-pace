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

function send(path, { event = true, everyHit = false } = {}) {
  if (!enabled()) return
  try {
    const params = new URLSearchParams({
      p: path,
      e: event ? 'true' : 'false',
      rnd: String(Date.now()),
    })
    // `ns` (no session): count this hit even if the same IP and browser sent
    // it within the last 8 hours. GoatCounter otherwise keeps one per
    // session, which merges learners behind one hub or carrier address and
    // drops a learner's second day when they open late and again early.
    if (everyHit) params.set('ns', 'true')
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
 * The events of one daily pacing snapshot: a single event naming the
 * learner's week and pace together (`week-4-behind`; `gd-week-13.5-on-track`
 * for other programs), so the dashboard can count learners by week, by pace
 * and by both.
 *
 * One event, not one per fact. GoatCounter's published limit is 4 hits a
 * second from one device, and the day's first open already sends 2
 * (trackAppOpen). The app used to send its program, week and pace separately,
 * 5 hits in all; the hosted service let them through, but one event keeps
 * well inside the limit and keeps week and pace together.
 * src/metrics/model.js reads the older events too, so every series runs on.
 */
export function pacingEvents(paceStatus, program = 'da') {
  const week = program === 'da' ? `week-${paceStatus.week}` : `${program}-week-${paceStatus.week}`
  return [`${week}-${paceStatus.status}`]
}

/**
 * Aggregate pacing snapshot — at most once per device per calendar day, so
 * each count reads as "learners active that day at week N with status X".
 * The app does the once-a-day itself, so every hit counts (see send).
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
  for (const event of pacingEvents(paceStatus, program)) send(event, { everyHit: true })
}
