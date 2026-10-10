import { describe, it, expect, vi } from 'vitest'
import {
  addDays,
  buildFile,
  dayRange,
  hitsToDays,
  mergeDays,
  mondayOf,
  mostBehindWeek,
  movingAverage,
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
})

describe('what a day says', () => {
  const counts = {
    '/': 20,
    'open-installed': 5,
    'open-browser': 15,
    'program-da': 12,
    'program-gd': 2,
    'week-4': 7,
    'week-5': 5,
    'week-4-behind': 3,
    'week-4-on-track': 4,
    'gd-week-13.5': 2,
    'gd-week-13.5-ahead': 2,
    'status-behind': 4,
    'status-on-track': 8,
    'status-ahead': 2,
  }

  it('counts Data Analytics learners by program, week and pace', () => {
    const d = readDay(counts, 'da')
    expect(d.active).toBe(12)
    expect(d.activeAll).toBe(14)
    expect(d.weeks).toEqual({ 4: 7, 5: 5 })
    expect(d.weekStatus).toEqual({ 4: { behind: 3, 'on-track': 4, ahead: 0 } })
    expect(d.status).toEqual({ behind: 4, 'on-track': 8, ahead: 2 })
    expect([d.opens, d.installed, d.browser]).toEqual([20, 5, 15])
  })

  it('reads another program’s prefixed weeks, half weeks included', () => {
    const d = readDay(counts, 'gd')
    expect(d.active).toBe(2)
    expect(d.weeks).toEqual({ 13.5: 2 })
    expect(d.weekStatus['13.5'].ahead).toBe(2)
  })
})

describe('a stretch of days', () => {
  const days = {
    '2026-10-05': { 'program-da': 10, 'week-4': 10, 'status-behind': 2, 'status-on-track': 8, 'open-installed': 1, 'open-browser': 3 },
    '2026-10-06': { 'program-da': 20, 'week-4': 15, 'week-5': 5, 'status-on-track': 20, 'open-browser': 4 },
  }

  it('averages active learners over every day in it, empty days too', () => {
    const s = summarize(series(days, '2026-10-05', '2026-10-08'))
    expect(s.days).toBe(4)
    expect(s.learnerDays).toBe(30)
    expect(s.avgActive).toBe(7.5)
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

  it('draws a 7-day average only once a full week is behind it', () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ active: n }))
    const ma = movingAverage(rows, (r) => r.active)
    expect(ma.slice(0, 6)).toEqual([null, null, null, null, null, null])
    expect(ma[6]).toBe(4)
    expect(ma[7]).toBe(5)
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
  days['2026-10-07']['program-da'] = 19

  it('covers last Monday to Sunday, compared with the week before', () => {
    const d = weeklyDigest(days, '2026-10-12')
    expect([d.from, d.to]).toEqual(['2026-10-05', '2026-10-11'])
    expect(d.avgActive).toBe(13)
    expect(d.avgActiveChange).toBeCloseTo(0.3)
    expect(d.peak).toEqual({ day: '2026-10-07', active: 19 })
    expect(d.topWeeks.map((w) => w.week)).toEqual(['4', '5'])
    expect(d.statusShare.behind).toBeCloseTo(0.25)
    expect(d.installedShare).toBeCloseTo(0.25)
  })

  it('reads the same week when run later in the week, or on the Sunday after', () => {
    expect(weeklyDigest(days, '2026-10-14').from).toBe('2026-10-05')
    expect(weeklyDigest(days, '2026-10-18').to).toBe('2026-10-11')
  })

  it('says so when nothing was counted', () => {
    const d = weeklyDigest({}, '2026-10-12')
    expect(d.hasData).toBe(false)
    const msg = digestMessage(d)
    expect(msg.text).toContain('no learner activity')
  })

  it('reads as a Slack message with the numbers, the comparison and the dashboard link', () => {
    const msg = digestMessage(weeklyDigest(days, '2026-10-12'))
    expect(msg.text).toBe('ALX Pace · Data Analytics · week of 5 Oct – 11 Oct 2026: 13 active learners a day')
    const all = JSON.stringify(msg.blocks)
    expect(all).toContain('↑ 30% on the week before')
    expect(all).toContain('On track 75% · Behind 25% · Ahead 0%')
    expect(all).toContain('Week 4 (8 a day) · Week 5 (4 a day)')
    expect(all).toContain('Wednesday, 19 learners')
    expect(all).toContain(DASHBOARD_URL)
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
