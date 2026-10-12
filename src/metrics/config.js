/**
 * Where the learner-usage numbers come from and where they are kept.
 *
 * The app sends anonymous GoatCounter events (src/lib/analytics.js). Once a
 * day, .github/workflows/metrics.yml reads them back through GoatCounter's API
 * (scripts/metrics/collect.mjs) and commits one JSON file to the `metrics`
 * branch, never to `main`: a daily commit there would redeploy the app and tag
 * a rollback point every morning. The dashboard (metrics/index.html, deployed
 * with the app) fetches that file when it opens, and just after midnight on
 * Fridays, West Africa Time, the same job posts a digest of the week to Slack
 * (scripts/metrics/digest.mjs).
 *
 * Imported by those Node scripts as well as by the dashboard, so every import
 * here and in its siblings names its file extension: plain Node cannot resolve
 * the app's extensionless imports (see CLAUDE.md on parser:check).
 */
export { GOATCOUNTER_SITE } from '../lib/analyticsConfig.js'

/** The app's address. Mirrors APP_URL in src/lib/appUrl.js (metrics.test.js holds them together). */
export const APP_URL = 'https://alxprograms.github.io/alx-pace/'
export const DASHBOARD_URL = `${APP_URL}metrics/`

/** The data branch and file the collector writes and the dashboard reads. */
export const METRICS_REPO = 'alxprograms/alx-pace'
export const METRICS_BRANCH = 'metrics'
export const METRICS_FILE = 'metrics.json'
export const DATA_URL = `https://raw.githubusercontent.com/${METRICS_REPO}/${METRICS_BRANCH}/${METRICS_FILE}`

/**
 * The first day the collector fetches when there is nothing stored yet: the
 * day the app began sending events (fae3130, 20 July 2026).
 */
export const COLLECT_FROM = '2026-07-20'

/**
 * How many days back each daily run fetches again. GoatCounter's day follows
 * the site's time zone, and a fetch that starts at UTC midnight can catch the
 * first of those days part-way, so that day is never trusted over what is
 * stored. The overlap also heals a missed run or a late beacon.
 */
export const REFETCH_DAYS = 10
