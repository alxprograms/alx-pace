/**
 * Learner-usage numbers: from GoatCounter's API response to the stored file,
 * and from the stored file to what the dashboard and the Slack digest say.
 *
 * Pure functions over plain data, shared by the Node collector, the weekly
 * digest and the dashboard (see config.js on the explicit `.js` imports).
 *
 * WHAT THE COUNTS MEAN
 * GoatCounter returns visitors per path per day. The app sends its pacing
 * snapshot at most once per device per day (src/lib/analytics.js), and each
 * snapshot names the learner's week, so a day's week events, added up, are
 * the devices that opened a program that day: "active learners". A learner
 * on two devices counts twice; one whose browser sends Do Not Track or
 * Global Privacy Control is not counted. App opens (`/`, `open-*`) are
 * GoatCounter visits: opens by one browser within 8 hours count once.
 *
 * THE STORED FILE (metrics.json on the `metrics` branch)
 *   { version: 1, site, updatedAt, firstDay, lastDay,
 *     days: { "2026-10-05": { "week-4-behind": 3, "week-4": 9, "/": 20, ... } } }
 * A day holds only non-zero counts; a day present with no keys is a day with
 * nothing counted. Days are GoatCounter's, in the site's time zone.
 */

export const STATUSES = ['behind', 'on-track', 'ahead']

/* ---------- dates: 'YYYY-MM-DD' strings, computed in UTC ---------- */

const DAY_MS = 86_400_000
const toTime = (day) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))
const fromTime = (t) => new Date(t).toISOString().slice(0, 10)

/** A real calendar day as 'YYYY-MM-DD': '2026-02-30' is not one. */
export const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromTime(toTime(s)) === s
export const addDays = (day, n) => fromTime(toTime(day) + n * DAY_MS)
export const daysBetween = (from, to) => Math.round((toTime(to) - toTime(from)) / DAY_MS)
export const todayUTC = (now = new Date()) => now.toISOString().slice(0, 10)

/** Every day from `from` to `to`, both included. */
export function dayRange(from, to) {
  const out = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** The Monday of the ISO week holding `day`. */
export function mondayOf(day) {
  const weekday = new Date(toTime(day)).getUTCDay() // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7))
}

/* ---------- GoatCounter → stored days ---------- */

/**
 * The name a path is stored under. Events come back without a slash
 * ("program-da"); the one pageview is "/". A stray leading slash on an event
 * is dropped, as GoatCounter itself does when it stores one.
 */
export function pathKey(hit) {
  const path = String(hit?.path ?? '').trim()
  if (hit?.event) return path.replace(/^\/+/, '')
  return path || '/'
}

/**
 * The days of one fetch, from `/api/v0/stats/hits?group=day` pages: every day
 * of the window, each with its non-zero counts. A day of the window that no
 * path reports is still listed, empty: nothing was counted that day.
 */
export function hitsToDays(hits, from, to) {
  const days = Object.fromEntries(dayRange(from, to).map((d) => [d, {}]))
  for (const hit of hits ?? []) {
    const key = pathKey(hit)
    if (!key) continue
    for (const stat of hit.stats ?? []) {
      const n = Number(stat?.daily) || 0
      if (!n || !(stat.day in days)) continue
      days[stat.day][key] = (days[stat.day][key] ?? 0) + n
    }
  }
  return days
}

/**
 * The stored days with a fresh fetch laid over them. Each fetched day replaces
 * the stored one whole, except the first day of the window, which a fetch
 * starting at UTC midnight may hold only part of: it fills a gap, and never
 * overwrites a day already stored.
 */
export function mergeDays(stored, fresh) {
  const out = { ...(stored ?? {}) }
  const freshDays = Object.keys(fresh).sort()
  freshDays.forEach((day, i) => {
    if (i === 0 && day in out) return
    out[day] = { ...fresh[day] }
  })
  return out
}

/** The stored file, made from its days. */
export function buildFile(days, { site, updatedAt }) {
  const sorted = Object.keys(days).sort()
  return {
    version: 1,
    site,
    updatedAt,
    firstDay: sorted[0] ?? null,
    lastDay: sorted.at(-1) ?? null,
    days: Object.fromEntries(sorted.map((d) => [d, sortKeys(days[d])])),
  }
}

const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))

/**
 * Whether a stored file can be read: the wrong shape is treated as nothing
 * stored, so the collector rebuilds it from COLLECT_FROM rather than merge
 * into it, and the dashboard says it has no data rather than draw nonsense.
 * Only real days are kept, none after `until` when given (a day from the
 * future would stop the collector fetching until it came), and the first and
 * last day are worked out from them, never taken on trust.
 */
export function readFile(file, { until } = {}) {
  if (!file || file.version !== 1 || typeof file.days !== 'object' || file.days === null) return null
  const days = {}
  for (const [day, counts] of Object.entries(file.days)) {
    if (!isDay(day) || (until && day > until) || typeof counts !== 'object' || counts === null) continue
    days[day] = {}
    for (const [k, v] of Object.entries(counts)) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) days[day][k] = n
    }
  }
  const sorted = Object.keys(days).sort()
  return {
    version: 1,
    site: typeof file.site === 'string' ? file.site : null,
    updatedAt: typeof file.updatedAt === 'string' && !Number.isNaN(Date.parse(file.updatedAt)) ? file.updatedAt : null,
    firstDay: sorted[0] ?? null,
    lastDay: sorted.at(-1) ?? null,
    days,
  }
}

/* ---------- stored days → what the dashboard and digest say ---------- */

/**
 * One day's counts, read into what they mean, for one program.
 *
 * The app has sent three sets of daily events (src/lib/analytics.js), and a
 * day can hold more than one while learners' apps update:
 *   from 20 Jul 2026  week-4, status-behind
 *   from 4 Oct 2026   program-da, week-4, status-behind
 *   from Oct 2026     week-4-behind, alone
 * Each sends exactly one week event a day for every active learner, plain or
 * with the pace, so a program's week events added up are its active
 * learners in every era. Data Analytics' weeks are bare (`week-N`); the other
 * programs' are prefixed (`gd-week-13.5`).
 *
 * `status-*` names no program. It is read as Data Analytics', which was all
 * there was until 4 Oct: Creative Tech was offered from 4 to 7 Oct, and its
 * few learners' paces from those days are in it.
 */
export function readDay(counts = {}, program = 'da') {
  const prefix = program === 'da' ? '' : `${program}-`
  const weekRe = new RegExp(`^${prefix}week-(\\d+(?:\\.\\d+)?)(?:-(${STATUSES.join('|')}))?$`)
  const status = Object.fromEntries(STATUSES.map((s) => [s, program === 'da' ? (counts[`status-${s}`] ?? 0) : 0]))
  const weeks = {}
  const weekStatus = {}
  for (const [key, n] of Object.entries(counts)) {
    const m = weekRe.exec(key)
    if (!m) continue
    const week = m[1]
    weeks[week] = (weeks[week] ?? 0) + n
    if (m[2]) {
      weekStatus[week] ??= { behind: 0, 'on-track': 0, ahead: 0 }
      weekStatus[week][m[2]] += n
      status[m[2]] += n
    }
  }
  return {
    active: Object.values(weeks).reduce((a, b) => a + b, 0),
    // GoatCounter's own count: every path's visits, events included.
    visits: Object.values(counts).reduce((a, b) => a + b, 0),
    paths: counts,
    status,
    weeks,
    weekStatus,
    opens: counts['/'] ?? 0,
    installed: counts['open-installed'] ?? 0,
    browser: counts['open-browser'] ?? 0,
  }
}

/** The days from `from` to `to`, each read for `program`, zero where nothing is stored. */
export function series(days, from, to, program = 'da') {
  return dayRange(from, to).map((day) => ({ day, ...readDay(days[day], program) }))
}

const sum = (rows, pick) => rows.reduce((a, r) => a + pick(r), 0)
const share = (part, whole) => (whole > 0 ? part / whole : null)

/** Weeks in course order: "2" before "10", "13.5" between "13" and "14". */
export const byWeek = (a, b) => Number(a) - Number(b)

/**
 * A stretch of days summed up, in exact counts: learner-days (one learner on
 * one day), the busiest day, the pace mix, installed share, where learners
 * are by week, and the same by week and pace where the combined events have
 * been counted.
 */
export function summarize(rows) {
  const n = rows.length
  const learnerDays = sum(rows, (r) => r.active)
  const statusTotals = Object.fromEntries(STATUSES.map((s) => [s, sum(rows, (r) => r.status[s])]))
  const statusAll = Object.values(statusTotals).reduce((a, b) => a + b, 0)
  const weeks = {}
  const weekStatus = {}
  for (const r of rows) {
    for (const [w, c] of Object.entries(r.weeks)) weeks[w] = (weeks[w] ?? 0) + c
    for (const [w, by] of Object.entries(r.weekStatus)) {
      weekStatus[w] ??= { behind: 0, 'on-track': 0, ahead: 0 }
      for (const s of STATUSES) weekStatus[w][s] += by[s]
    }
  }
  const installed = sum(rows, (r) => r.installed)
  const browser = sum(rows, (r) => r.browser)
  const peak = rows.reduce((best, r) => (r.active > (best?.active ?? -1) ? r : best), null)
  const paths = {}
  for (const r of rows) for (const [p, c] of Object.entries(r.paths ?? {})) paths[p] = (paths[p] ?? 0) + c
  return {
    days: n,
    visits: sum(rows, (r) => r.visits ?? 0),
    paths,
    learnerDays,
    peak: peak && peak.active > 0 ? { day: peak.day, active: peak.active } : null,
    status: statusTotals,
    statusShare: Object.fromEntries(STATUSES.map((s) => [s, share(statusTotals[s], statusAll)])),
    installed,
    browser,
    installedShare: share(installed, installed + browser),
    opens: sum(rows, (r) => r.opens),
    weeks,
    weekStatus,
    hasWeekStatus: Object.keys(weekStatus).length > 0,
  }
}

/**
 * The weekly rhythm: average learners on each weekday, Monday first, with the
 * busiest and the quietest. Null until every weekday has been seen twice (one
 * Monday is an anecdote, not a rhythm) or when the days don't differ. A
 * busiest or quietest shared by two weekdays is null: naming one would be
 * wrong.
 */
export function weekdayPattern(rows) {
  const totals = Array(7).fill(0)
  const seen = Array(7).fill(0)
  for (const r of rows) {
    const weekday = (new Date(`${r.day}T00:00:00Z`).getUTCDay() + 6) % 7
    totals[weekday] += r.active
    seen[weekday] += 1
  }
  if (seen.some((n) => n < 2)) return null
  const avg = totals.map((t, i) => t / seen[i])
  const max = Math.max(...avg)
  const min = Math.min(...avg)
  if (max === min) return null
  const only = (v) => (avg.filter((a) => a === v).length === 1 ? avg.indexOf(v) : null)
  const busiest = only(max)
  const quietest = only(min)
  return busiest == null && quietest == null ? null : { avg, busiest, quietest }
}

/**
 * The course week where being behind is most common, among weeks with at
 * least `minimum` learner-days of pace counted (fewer is a handful of people,
 * and a share of a handful says little). Ties go to the earlier week.
 */
export function mostBehindWeek(weekStatus, minimum = 10) {
  let best = null
  for (const [week, by] of Object.entries(weekStatus).sort(([a], [b]) => byWeek(a, b))) {
    const total = STATUSES.reduce((a, s) => a + by[s], 0)
    if (total < minimum || by.behind === 0) continue
    const shareBehind = by.behind / total
    if (!best || shareBehind > best.share) best = { week, share: shareBehind }
  }
  return best
}

/**
 * GoatCounter's dashboard lists its top `limit` paths (10 unless changed in
 * its settings) and says "N out of M visits shown": N is what those paths
 * hold, M is every visit. The same for a stretch of days here.
 */
export function shownVisits(paths, limit = 10) {
  return Object.values(paths)
    .sort((a, b) => b - a)
    .slice(0, limit)
    .reduce((a, b) => a + b, 0)
}

/**
 * What the visits were: app opens (the page view), how the app was opened,
 * and the daily week-and-pace events (program, week and pace, in every set
 * the app has sent). Anything else, such as a test hit, is `other`.
 */
export function visitKinds(paths) {
  const kinds = { opens: 0, howOpened: 0, weekPace: 0, other: 0 }
  for (const [p, n] of Object.entries(paths)) {
    if (p === '/') kinds.opens += n
    else if (p.startsWith('open-')) kinds.howOpened += n
    else if (/^(program-|status-|(?:[a-z]+-)?week-)/.test(p)) kinds.weekPace += n
    else kinds.other += n
  }
  return kinds
}

/** The change from `before` to `after` as a fraction (0.12 = +12%); null with nothing before. */
export const change = (after, before) => (before > 0 ? (after - before) / before : null)

/**
 * The Monday digest: the last full Monday-to-Sunday week before `today`, and
 * the week before it to compare with. `program` as in readDay.
 */
export function weeklyDigest(days, today, program = 'da') {
  const thisMonday = mondayOf(today)
  const from = addDays(thisMonday, -7)
  const to = addDays(thisMonday, -1)
  const week = summarize(series(days, from, to, program))
  const prior = summarize(series(days, addDays(from, -7), addDays(from, -1), program))
  const topWeeks = Object.entries(week.weeks)
    .sort(([wa, a], [wb, b]) => b - a || byWeek(wa, wb))
    .slice(0, 3)
    .map(([w, learnerDays]) => ({ week: w, learnerDays }))
  return {
    from,
    to,
    program,
    visits: week.visits,
    visitsChange: change(week.visits, prior.visits),
    learnerDays: week.learnerDays,
    learnerDaysChange: change(week.learnerDays, prior.learnerDays),
    peak: week.peak,
    status: week.status,
    statusShare: week.statusShare,
    installed: week.installed,
    browser: week.browser,
    installedShare: week.installedShare,
    topWeeks,
    hasData: week.learnerDays > 0 || week.opens > 0,
  }
}

/**
 * Whether the weekly digest should be posted: its week is later than the last
 * one posted (`posted`, that week's Monday, or null for none yet), or it is
 * asked for again.
 */
export const digestDue = (posted, digest, force = false) => force || !posted || posted < digest.from
