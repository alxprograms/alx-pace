/**
 * Anonymous usage analytics — activation switch.
 *
 * We use GoatCounter (open-source, cookieless, no personal data). To activate:
 *   1. Create a free site at https://www.goatcounter.com (pick a code,
 *      e.g. "alxpace").
 *   2. Put that code in GOATCOUNTER_SITE below. Done — deploys with the next
 *      push to main.
 *
 * While GOATCOUNTER_SITE is empty, no request of any kind is sent.
 *
 * What gets reported when active (see src/lib/analytics.js — aggregate
 * tallies only, never identities):
 *   - an app-open pageview
 *   - whether the app runs installed (standalone) or in a browser tab
 *   - once per device per day: the learner's program (da / cc / gd),
 *     current week number and pacing status (behind / on-track / ahead)
 *     as bare event names, and the week and status together
 *     (`week-4-behind`), so learners can be counted by both at once
 *
 * The public dashboard at /metrics/ reads these counts, collected daily from
 * GoatCounter's API by .github/workflows/metrics.yml (see scripts/metrics/).
 * Tracking is skipped entirely for browsers signalling Do Not Track or
 * Global Privacy Control.
 */
export const GOATCOUNTER_SITE = 'alxpace'
