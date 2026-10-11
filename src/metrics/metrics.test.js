import { describe, it, expect, vi } from 'vitest'
import {
  addDays,
  buildFile,
  dayRange,
  digestDue,
  hitsToDays,
  isDay,
  mergeDays,
  mondayOf,
  mostBehindWeek,
  shownVisits,
  visitKinds,
  pathKey,
  readDay,
  readFile,
  series,
  summarize,
  weekdayPattern,
  weeklyDigest,
} from './model.js'
import { fetchDailyHits, GoatCounterError } from './goatcounter.js'
import { digestMessage } from './slack.js'
import { APP_URL, DASHBOARD_URL, DATA_URL } from './config.js'
import { APP_URL as APP_URL_OF_APP } from '../lib/appUrl'

/*
  The learner-usage numbers, from GoatCounter's API to the stored file, and
  from the file to the dashboard and the Monday digest. The API shapes are
  the ones in GoatCounter's own test data (handlers/testdata/api-hits-*.json):
  one `stats` entry per day of the range, zero days included, event paths
  without a leading slash.
*/

const hit = (path, daily, { event = true, id } = {}) => ({
  path,
  event,
  path_id: id ?? path.length,
  count: Object.values(daily).reduce((a, b) => a + b, 0),
  stats: Object.entries(daily).map(([day, n]) => ({ day, daily: n, hourly: [] })),
})

describe('dates', () => {
  it('counts days in UTC, across months and the year', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(dayRange('2026-10-04', '2026-10-06')).toEqual(['2026-10-04', '2026-10-05', '2026-10-06'])
  })

  it('finds the Monday of a week, Sunday included', () => {
    expect(mondayOf('2026-10-12')).toBe('2026-10-12') // Monday
    expect(mondayOf('2026-10-18')).toBe('2026-10-12') // Sunday
    expect(mondayOf('2026-10-10')).toBe('2026-10-05') // Saturday
  })
})

describe('from GoatCounter to stored days', () => {
  it('names events without a slash and the pageview as "/"', () => {
    expect(pathKey({ path: 'program-da', event: true })).toBe('program-da')
    expect(pathKey({ path: '/week-4', event: true })).toBe('week-4')
    expect(pathKey({ path: '/', event: false })).toBe('/')
  })

  it('keeps every day of the window and only non-zero counts', () => {
    const days = hitsToDays(
      [
        hit('program-da', { '2026-10-05': 3, '2026-10-06': 0 }),
        hit('/', { '2026-10-05': 4 }, { event: false }),
      ],
      '2026-10-05',
      '2026-10-07',
    )
    expect(days).toEqual({
      '2026-10-05': { 'program-da': 3, '/': 4 },
      '2026-10-06': {},
      '2026-10-07': {},
    })
  })

  it('ignores days outside the window', () => {
    const days = hitsToDays([hit('program-da', { '2026-10-01': 9 })], '2026-10-05', '2026-10-05')
    expect(days).toEqual({ '2026-10-05': {} })
  })

  it('lets a fetch replace the days it holds whole, but never its first, possibly partial, day', () => {
    const stored = {
      '2026-10-01': { 'program-da': 5 },
      '2026-10-02': { 'program-da': 6, 'week-1': 6 },
      '2026-10-03': { 'program-da': 1 },
    }
    const fresh = {
      '2026-10-02': { 'program-da': 2 }, // window start: partial, already stored
      '2026-10-03': { 'program-da': 7 },
      '2026-10-04': {},
    }
    expect(mergeDays(stored, fresh)).toEqual({
      '2026-10-01': { 'program-da': 5 },
      '2026-10-02': { 'program-da': 6, 'week-1': 6 },
      '2026-10-03': { 'program-da': 7 },
      '2026-10-04': {},
    })
  })

  it('fills the window start when nothing is stored for it', () => {
    expect(mergeDays({}, { '2026-10-02': { x: 1 } })).toEqual({ '2026-10-02': { x: 1 } })
  })

  it('writes a sorted file with its first and last day, and reads it back', () => {
    const file = buildFile(
      { '2026-10-06': { b: 1, a: 2 }, '2026-10-05': {} },
      { site: 'alxpace', updatedAt: '2026-10-07T05:00:00Z' },
    )
    expect(file.firstDay).toBe('2026-10-05')
    expect(file.lastDay).toBe('2026-10-06')
    expect(Object.keys(file.days)).toEqual(['2026-10-05', '2026-10-06'])
    expect(Object.keys(file.days['2026-10-06'])).toEqual(['a', 'b'])
    expect(readFile(JSON.parse(JSON.stringify(file))).days).toEqual(file.days)
  })

  it('reads a file of the wrong shape as nothing stored, and drops bad entries', () => {
    expect(readFile(null)).toBeNull()
    expect(readFile({ version: 2, days: {} })).toBeNull()
    expect(readFile({ version: 1, days: { 'not-a-day': { a: 1 }, '2026-10-05': { a: 'x', b: -1, c: 2 } } }).days).toEqual({
      '2026-10-05': { c: 2 },
    })
  })

  it('keeps only real days, none after the day given, and works out the first and last itself', () => {
    const file = readFile(
      {
        version: 1,
        firstDay: 'garbage',
        lastDay: '2026-10-99',
        updatedAt: 'not a time',
        days: { '2026-10-99': { a: 1 }, '2026-02-30': { a: 1 }, '2026-10-04': { a: 1 }, '2026-10-05': { a: 1 }, '2027-01-01': { a: 1 } },
      },
      { until: '2026-10-10' },
    )
    expect(Object.keys(file.days)).toEqual(['2026-10-04', '2026-10-05'])
    expect([file.firstDay, file.lastDay, file.updatedAt]).toEqual(['2026-10-04', '2026-10-05', null])
    expect(isDay('2026-02-30')).toBe(false)
    expect(isDay('2024-02-29')).toBe(true)
  })
})

describe('what a day says', () => {
  // A day as the app sends it now: one event a learner, week and pace together.
  const counts = {
    '/': 20,
    'open-installed': 5,
    'open-browser': 15,
    'week-4-behind': 3,
    'week-4-on-track': 4,
    'week-5-ahead': 5,
    'gd-week-13.5-ahead': 2,
  }

  it('counts Data Analytics learners by week, by pace and by both', () => {
    const d = readDay(counts, 'da')
    expect(d.active).toBe(12)
    expect(d.weeks).toEqual({ 4: 7, 5: 5 })
    expect(d.weekStatus).toEqual({ 4: { behind: 3, 'on-track': 4, ahead: 0 }, 5: { behind: 0, 'on-track': 0, ahead: 5 } })
    expect(d.status).toEqual({ behind: 3, 'on-track': 4, ahead: 5 })
    expect([d.opens, d.installed, d.browser]).toEqual([20, 5, 15])
  })

  it('reads another program’s prefixed weeks, half weeks included', () => {
    const d = readDay(counts, 'gd')
    expect(d.active).toBe(2)
    expect(d.weeks).toEqual({ 13.5: 2 })
    expect(d.status).toEqual({ behind: 0, 'on-track': 0, ahead: 2 })
  })

  it('counts the learners of July to October, before the app named a program', () => {
    // 20 Jul – 3 Oct: week and pace, sent separately.
    const d = readDay({ 'week-3': 6, 'week-4': 4, 'status-behind': 2, 'status-on-track': 8 })
    expect(d.active).toBe(10)
    expect(d.weeks).toEqual({ 3: 6, 4: 4 })
    expect(d.status).toEqual({ behind: 2, 'on-track': 8, ahead: 0 })
    expect(d.weekStatus).toEqual({})
  })

  it('counts each learner once on a day when apps are part-way through an update', () => {
    // 4 Oct – now: program, week and pace; then the new single event.
    const d = readDay({ 'program-da': 9, 'week-4': 9, 'status-behind': 1, 'week-4-behind': 2, 'week-5-on-track': 3, 'cc-week-2': 1, 'status-ahead': 1 })
    expect(d.active).toBe(14)
    expect(d.weeks).toEqual({ 4: 11, 5: 3 })
    expect(d.status).toEqual({ behind: 3, 'on-track': 3, ahead: 1 })
    expect(readDay({ 'program-cc': 1, 'cc-week-2': 1, 'status-ahead': 1 }, 'cc').status.ahead).toBe(0)
  })
})

describe('a stretch of days', () => {
  const days = {
    '2026-10-05': { 'program-da': 10, 'week-4': 10, 'status-behind': 2, 'status-on-track': 8, 'open-installed': 1, 'open-browser': 3 },
    '2026-10-06': { 'program-da': 20, 'week-4': 15, 'week-5': 5, 'status-on-track': 20, 'open-browser': 4 },
  }

  it('counts every visit GoatCounter recorded, as its dashboard does', () => {
    const s = summarize(series(days, '2026-10-05', '2026-10-08'))
    // 10+10+2+8+1+3 on the 5th, 20+15+5+20+4 on the 6th.
    expect(s.visits).toBe(98)
    expect(s.paths['week-4']).toBe(25)
    // "N out of M visits shown": GoatCounter lists its top paths, here
    // program-da 30, status-on-track 28 and week-4 25.
    expect(shownVisits(s.paths, 3)).toBe(30 + 28 + 25)
    expect(shownVisits(s.paths)).toBe(98)
    expect(visitKinds({ '/': 5, 'open-browser': 4, 'open-installed': 1, 'week-4-behind': 2, 'gd-week-13.5': 1, 'program-da': 3, 'status-ahead': 1, 'connectivity-test': 1 })).toEqual({
      opens: 5,
      howOpened: 5,
      weekPace: 7,
      other: 1,
    })
  })

  it('counts learner-days over every day in it, empty days too', () => {
    const s = summarize(series(days, '2026-10-05', '2026-10-08'))
    expect(s.days).toBe(4)
    expect(s.learnerDays).toBe(30)
    expect(s.peak).toEqual({ day: '2026-10-06', active: 20 })
    expect(s.statusShare.behind).toBeCloseTo(2 / 30)
    expect(s.installed).toBe(1)
    expect(s.browser).toBe(7)
    expect(s.installedShare).toBeCloseTo(1 / 8)
    expect(s.weeks).toEqual({ 4: 25, 5: 5 })
    expect(s.hasWeekStatus).toBe(false)
  })

  it('has no shares and no peak with nothing counted', () => {
    const s = summarize(series({}, '2026-10-05', '2026-10-06'))
    expect(s.peak).toBeNull()
    expect(s.installedShare).toBeNull()
    expect(s.statusShare.behind).toBeNull()
  })
})

describe('what the dashboard says about it', () => {
  const day = (d, active) => ({ day: d, active })

  it('finds the busiest and quietest weekday, Monday first', () => {
    // 2026-09-07 is a Monday; two of every weekday, Mondays busiest, Saturdays quietest.
    const rows = dayRange('2026-09-07', '2026-09-20').map((d, i) => day(d, [9, 5, 5, 5, 5, 1, 4][i % 7]))
    const p = weekdayPattern(rows)
    expect(p.busiest).toBe(0)
    expect(p.quietest).toBe(5)
    expect(p.avg[0]).toBe(9)
  })

  it('says nothing of a rhythm until every weekday is seen twice, or when days are alike', () => {
    expect(weekdayPattern(dayRange('2026-09-07', '2026-09-19').map((d) => day(d, 3)))).toBeNull()
    expect(weekdayPattern(dayRange('2026-09-07', '2026-09-20').map((d) => day(d, 3)))).toBeNull()
  })

  it('names no busiest or quietest weekday that another weekday ties', () => {
    // Mondays busiest; Tuesday to Saturday all tied for quietest.
    const p = weekdayPattern(dayRange('2026-09-07', '2026-09-20').map((d, i) => day(d, [3, 0, 0, 0, 0, 0, 1][i % 7])))
    expect([p.busiest, p.quietest]).toEqual([0, null])
    expect(weekdayPattern(dayRange('2026-09-07', '2026-09-20').map((d, i) => day(d, [3, 3, 0, 0, 0, 0, 1][i % 7])))).toBeNull()
  })

  it('finds the week where behind is most common, ignoring a handful of learners', () => {
    const weekStatus = {
      2: { behind: 2, 'on-track': 8, ahead: 0 },
      3: { behind: 6, 'on-track': 4, ahead: 0 },
      10: { behind: 3, 'on-track': 0, ahead: 0 },
      4: { behind: 6, 'on-track': 4, ahead: 0 },
    }
    expect(mostBehindWeek(weekStatus)).toEqual({ week: '3', share: 0.6 })
    expect(mostBehindWeek({ 2: { behind: 0, 'on-track': 12, ahead: 3 } })).toBeNull()
    expect(mostBehindWeek({})).toBeNull()
  })
})

describe('the Monday digest', () => {
  // Week of 5–11 Oct 2026, and the week before it.
  const days = {}
  for (const d of dayRange('2026-09-28', '2026-10-04')) days[d] = { 'program-da': 10, 'week-3': 10, 'status-on-track': 10 }
  for (const d of dayRange('2026-10-05', '2026-10-11')) {
    days[d] = { 'program-da': 12, 'week-4': 8, 'week-5': 4, 'status-behind': 3, 'status-on-track': 9, 'open-installed': 3, 'open-browser': 9 }
  }
  days['2026-10-07'] = { ...days['2026-10-07'], 'program-da': 19, 'week-4': 15 }

  it('covers last Monday to Sunday, compared with the week before', () => {
    const d = weeklyDigest(days, '2026-10-12')
    expect([d.from, d.to]).toEqual(['2026-10-05', '2026-10-11'])
    expect(d.learnerDays).toBe(91)
    expect(d.learnerDaysChange).toBeCloseTo(0.3)
    expect(d.peak).toEqual({ day: '2026-10-07', active: 19 })
    expect(d.topWeeks.map((w) => w.week)).toEqual(['4', '5'])
    expect(d.statusShare.behind).toBeCloseTo(0.25)
    expect(d.installedShare).toBeCloseTo(0.25)
  })

  it('reads the same week when run later in the week, or on the Sunday after', () => {
    expect(weeklyDigest(days, '2026-10-14').from).toBe('2026-10-05')
    expect(weeklyDigest(days, '2026-10-18').to).toBe('2026-10-11')
  })

  it('is posted once a week: on the Monday, or on the first run after it', () => {
    const monday = weeklyDigest(days, '2026-10-12')
    expect(digestDue(null, monday)).toBe(true)
    expect(digestDue('2026-09-28', monday)).toBe(true)
    // Monday's run failed: Tuesday's still owes the same week.
    expect(digestDue('2026-09-28', weeklyDigest(days, '2026-10-13'))).toBe(true)
    expect(digestDue('2026-10-05', weeklyDigest(days, '2026-10-13'))).toBe(false)
    expect(digestDue('2026-10-05', monday, true)).toBe(true)
  })

  it('gives exact counts, never averages: learners are people', () => {
    // 20 learner-days over the week: said as 20, not as 2.9 a day.
    const quiet = {}
    for (const d of dayRange('2026-09-28', '2026-10-04')) quiet[d] = { 'week-1-on-track': d === '2026-09-28' ? 8 : 2 }
    const msg = digestMessage(weeklyDigest(quiet, '2026-10-05'))
    const all = JSON.stringify(msg.blocks)
    expect(msg.text).toContain('20 learner-days')
    expect(all).toContain('*20* learner-days this week: each learner counted once for each day they opened Pace')
    expect(all).toContain('Week 1: 20')
    expect(all).not.toMatch(/a day on average|\d\.\d/)
  })

  it('names no busiest day that others tie with, and says 1 learner, not 1 learners', () => {
    // 10–16 Aug 2026 as it was: 2 learners on Monday, Tuesday and Wednesday, 1 on the rest.
    const tied = {}
    dayRange('2026-08-10', '2026-08-16').forEach((d, i) => (tied[d] = { 'week-1': i < 3 ? 2 : 1 }))
    const d = weeklyDigest(tied, '2026-08-17')
    expect(d.peakDays).toBe(3)
    expect(JSON.stringify(digestMessage(d).blocks)).toContain('Busiest day*\\n2 learners, on 3 days')
    const one = { '2026-08-12': { 'week-1': 1 } }
    expect(JSON.stringify(digestMessage(weeklyDigest(one, '2026-08-17')).blocks)).toContain('Busiest day*\\nWednesday 12 Aug, 1 learner"')
  })

  it('leads with every visit since counting began, to the end of the week, and the week’s share', () => {
    // Counting began on 28 Sept: 210 visits that week, 350 in the digest's week.
    const d = weeklyDigest(days, '2026-10-12')
    expect(d.since).toBe('2026-09-28')
    expect(d.visitsTotal).toBe(210 + 350)
    // A day after the digest's week, collected by Monday's run, is not in its total.
    expect(weeklyDigest({ ...days, '2026-10-12': { '/': 40 } }, '2026-10-12').visitsTotal).toBe(560)
    const lines = digestMessage(d).blocks[1].text.text.split('\n')
    expect(lines.slice(0, 2)).toEqual(['*560* visits on GoatCounter so far, since counting began on 28 Sept 2026', '*350* visits this week (↑ 67% on the week before)'])
    // Counting began weeks before the two compared: the total is every day, not those two weeks.
    const earlier = weeklyDigest({ ...days, '2026-09-14': { '/': 5 } }, '2026-10-12')
    expect([earlier.since, earlier.visitsTotal]).toEqual(['2026-09-14', 565])
    expect(digestMessage(earlier).blocks[1].text.text.split('\n')[0]).toBe('*565* visits on GoatCounter so far, since counting began on 14 Sept 2026')
  })

  it('says where the total stops, not "so far", when collecting stopped before the week ended', () => {
    // Nothing stored after Thursday 8 Oct: the key removed, say, so the job collects nothing.
    const stopped = Object.fromEntries(Object.entries(days).filter(([day]) => day <= '2026-10-08'))
    const msg = digestMessage(weeklyDigest(stopped, '2026-10-12'))
    const all = JSON.stringify(msg)
    expect(all).not.toContain('so far')
    expect(msg.blocks[1].text.text.split('\n')[0]).toBe('*416* visits on GoatCounter to 8 Oct 2026, since counting began on 28 Sept 2026')
    expect(msg.text).toContain('416 visits to 8 Oct 2026; this week')
    expect(all).toContain('counted from 28 Sept 2026 to Thursday 8 Oct')
  })

  it('says "N out of M visits shown" as GoatCounter does when it lists only some paths', () => {
    // 12 paths, 1 to 12 visits each: GoatCounter's top 10 hold 12 + 11 + … + 3.
    const many = { '2026-10-05': Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`week-${i + 1}`, i + 1])) }
    // A week earlier, 10 app opens: 13 paths in all, so the line is every day's (82 of 88), not the week's (75 of 78).
    // The stored days run on to the week's Sunday, as the morning job's always do.
    const d = weeklyDigest({ ...many, '2026-09-28': { '/': 10 }, '2026-10-11': {} }, '2026-10-12')
    expect([d.visitsTotalShown, d.visitsTotal, d.visits]).toEqual([82, 88, 78])
    expect(digestMessage(d).blocks[1].text.text.split('\n').slice(0, 3)).toEqual([
      '*88* visits on GoatCounter so far, since counting began on 28 Sept 2026',
      '82 out of 88 visits shown, as GoatCounter lists its top 10 paths',
      '*78* visits this week (↑ 680% on the week before)',
    ])
  })

  it('says so when nothing was counted', () => {
    const d = weeklyDigest({}, '2026-10-12')
    expect(d.hasData).toBe(false)
    const msg = digestMessage(d)
    expect(msg.text).toContain('no learner activity')
    expect(JSON.stringify(msg.blocks)).not.toContain('so far')
    // A quiet week still carries the running total.
    const quiet = digestMessage(weeklyDigest({ '2026-09-30': { '/': 7, 'week-1': 2 }, '2026-10-11': {} }, '2026-10-12'))
    expect(quiet.blocks[1].text.text).toContain('*9* visits on GoatCounter so far, since counting began on 30 Sept 2026')
  })

  it('reads as a Slack message with the numbers, the comparison and the dashboard link', () => {
    const msg = digestMessage(weeklyDigest(days, '2026-10-12'))
    expect(msg.text).toBe('ALX Pace · Data Analytics · week of 5 Oct – 11 Oct 2026: 560 visits so far; this week 350 visits, 91 learner-days')
    const all = JSON.stringify(msg.blocks)
    // Visits lead: GoatCounter's own number, then learners.
    expect(msg.blocks[1].text.text.split('\n')[0]).toBe('*560* visits on GoatCounter so far, since counting began on 28 Sept 2026')
    expect(all).toContain('↑ 30% on the week before')
    expect(all).toContain('On track 63 (75%) · Behind 21 (25%) · Ahead 0 (0%)')
    expect(all).toContain('Week 4: 63 · Week 5: 28')
    expect(all).toContain('Wednesday 7 Oct, 19 learners')
    expect(all).toContain('App opens*\\n84 · 21 from the installed app (25%)')
    // The button opens the dashboard on the digest's own week.
    expect(msg.blocks.find((b) => b.type === 'actions').elements[0].url).toBe(`${DASHBOARD_URL}?from=2026-10-05&to=2026-10-11`)
  })
})

describe('fetching from GoatCounter', () => {
  const page = (hits, more) => ({
    ok: true,
    status: 200,
    json: async () => ({ hits, more, total: 0 }),
    headers: { get: () => null },
  })

  it('pages by excluding the path ids already returned, with the token as a bearer', async () => {
    const calls = []
    const fetchImpl = vi.fn(async (url, init) => {
      calls.push({ url: new URL(url), init })
      return calls.length === 1
        ? page([hit('program-da', { '2026-10-05': 1 }, { id: 7 })], true)
        : page([hit('week-4', { '2026-10-05': 1 }, { id: 9 })], false)
    })
    const hits = await fetchDailyHits({
      site: 'alxpace',
      token: 'secret',
      from: '2026-10-01',
      to: '2026-10-10',
      fetchImpl,
      sleep: async () => {},
    })
    expect(hits.map((h) => h.path)).toEqual(['program-da', 'week-4'])
    expect(calls[0].url.origin + calls[0].url.pathname).toBe('https://alxpace.goatcounter.com/api/v0/stats/hits')
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({
      start: '2026-10-01',
      end: '2026-10-10',
      group: 'day',
      limit: '100',
    })
    expect(calls[1].url.searchParams.get('exclude_paths')).toBe('7')
    expect(calls[0].init.headers.Authorization).toBe('Bearer secret')
  })

  it('waits out a 429 for as long as GoatCounter says, then carries on', async () => {
    const waits = []
    let n = 0
    const fetchImpl = async () =>
      ++n === 1
        ? { ok: false, status: 429, headers: { get: (h) => (h === 'X-Rate-Limit-Reset' ? '3' : null) }, text: async () => '' }
        : page([], false)
    await fetchDailyHits({ site: 's', token: 't', from: '2026-10-01', to: '2026-10-02', fetchImpl, sleep: async (ms) => waits.push(ms) })
    expect(waits).toEqual([3000])
  })

  it('tries again after a 5xx or a dropped connection, then gives up with a clear error', async () => {
    const waits = []
    let n = 0
    const flaky = async () => {
      n++
      if (n === 1) throw new TypeError('fetch failed')
      if (n === 2) return { ok: false, status: 502, headers: { get: () => null }, text: async () => 'Bad Gateway' }
      return page([], false)
    }
    await fetchDailyHits({ site: 's', token: 't', from: '2026-10-01', to: '2026-10-02', fetchImpl: flaky, sleep: async (ms) => waits.push(ms) })
    expect(waits).toEqual([2000, 4000])

    const down = async () => ({ ok: false, status: 503, headers: { get: () => null }, text: async () => 'down' })
    const err = await fetchDailyHits({ site: 's', token: 't', from: 'a', to: 'b', fetchImpl: down, sleep: async () => {} }).catch((e) => e)
    expect(err).toBeInstanceOf(GoatCounterError)
    expect(err.message).toContain('503')
  })

  it('asks again after GoatCounter’s 404 on a key’s first request of the day, once', async () => {
    // GoatCounter c031008: the first request with a key unused for 24 hours
    // gets 404 {"error":"not found"}; the next one works.
    let n = 0
    const firstUse = async () => (++n === 1 ? { ok: false, status: 404, headers: { get: () => null }, text: async () => '{"error":"not found"}' } : page([], false))
    await fetchDailyHits({ site: 's', token: 't', from: '2026-10-01', to: '2026-10-02', fetchImpl: firstUse, sleep: async () => {} })
    expect(n).toBe(2)

    let calls = 0
    const wrongSite = async () => (calls++, { ok: false, status: 404, headers: { get: () => null }, text: async () => '{"error":"not found"}' })
    const err = await fetchDailyHits({ site: 's', token: 't', from: 'a', to: 'b', fetchImpl: wrongSite, sleep: async () => {} }).catch((e) => e)
    expect(calls).toBe(2)
    expect(err).toBeInstanceOf(GoatCounterError)
    expect(err.message).toContain('GOATCOUNTER_SITE')
  })

  it('fails with GoatCounter’s own message on a bad key, without the token', async () => {
    const fetchImpl = async () => ({ ok: false, status: 401, headers: { get: () => null }, text: async () => '{"error":"invalid key"}' })
    const err = await fetchDailyHits({ site: 's', token: 'secret', from: 'a', to: 'b', fetchImpl, sleep: async () => {} }).catch((e) => e)
    expect(err).toBeInstanceOf(GoatCounterError)
    expect(err.message).toContain('401')
    expect(err.message).not.toContain('secret')
  })
})

describe('where things live', () => {
  it('keeps its copy of the app address in step with the app’s', () => {
    expect(APP_URL).toBe(APP_URL_OF_APP)
  })

  it('reads the data from the metrics branch, never from main', () => {
    expect(DATA_URL).toBe('https://raw.githubusercontent.com/alxprograms/alx-pace/metrics/metrics.json')
  })
})
