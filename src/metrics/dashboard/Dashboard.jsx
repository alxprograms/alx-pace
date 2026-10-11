import { useEffect, useMemo, useState } from 'react'
import portrait1 from '../../assets/alx/banner-img1.webp'
import portrait2 from '../../assets/alx/banner-img2.webp'
import portrait3 from '../../assets/alx/banner-img3.webp'
import portrait4 from '../../assets/alx/banner-img4.webp'
import portrait5 from '../../assets/alx/banner-img5.webp'
import logo from '../../assets/alx/header-logo.svg'
import { APP_URL, DATA_URL } from '../config.js'
import { addDays, byWeek, change, daysBetween, mostBehindWeek, movingAverage, readFile, series, summarize, weekdayPattern, STATUSES } from '../model.js'
import { DailyActiveChart, Legend, MeterDial, PaceDial, PaceMixChart, Sparkline, WeeksChart } from './charts.jsx'
import { fmtAvg, fmtChange, fmtDay, fmtInt, fmtOne, fmtPct } from './format.js'
import { DAILY, LIME, PACE, PACE_ORDER } from './palette.js'

/*
  ALX Pace · Learner pulse: how learners use the app, from the anonymous
  counts the metrics job collects every morning (see src/metrics/config.js).

  Laid out for a desktop screen, after the ALX "flywheel" report: a band with
  the date range, the figures at a glance, then one question per chart, with
  what the chart says written out beside it. It still reads on a phone.

  One date range scopes everything on the page, and every figure is compared
  with the same length of time just before it, once that is all on record.
  Days run to the last complete one: the morning's file also holds today so
  far, which would read as a drop.
*/

const PORTRAITS = [portrait1, portrait2, portrait3, portrait4, portrait5]
const RANGES = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
  { id: 'all', label: 'All' },
]
const PROGRAM = 'da'
const DA_WEEKS = Array.from({ length: 14 }, (_, i) => String(i + 1))
const WEEKDAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
const WIDTH = 'mx-auto w-full max-w-[1320px] px-5 sm:px-8 lg:px-12'

/**
 * Where the data comes from: the `metrics` branch, or, while developing, a
 * file named by ?data= (never in a built page, so the public dashboard can't
 * be pointed at made-up numbers by a link).
 */
function dataSource() {
  if (import.meta.env.DEV) {
    const local = new URLSearchParams(window.location.search).get('data')
    if (local) return local
  }
  return DATA_URL
}

function useMetrics() {
  const [state, setState] = useState({ status: 'loading' })
  useEffect(() => {
    let alive = true
    fetch(dataSource(), { cache: 'no-cache' })
      .then(async (res) => {
        if (res.status === 404) return { status: 'empty' }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const file = readFile(await res.json())
        // A file with only today in it has no complete day to show yet.
        if (!file || !file.lastDay || lastCompleteDay(file) < file.firstDay) return { status: 'empty' }
        return { status: 'ready', file }
      })
      .catch((error) => ({ status: 'error', error }))
      .then((next) => alive && setState(next))
    return () => {
      alive = false
    }
  }, [])
  return state
}

/** The last day whose counts are complete: the day before the file was written, at the latest. */
function lastCompleteDay(file) {
  const written = file.updatedAt?.slice(0, 10)
  return written && file.lastDay >= written ? addDays(written, -1) : file.lastDay
}

export default function Dashboard() {
  const metrics = useMetrics()
  const [range, setRange] = useState(30)

  return (
    <>
      <Header file={metrics.file} range={metrics.status === 'ready' ? range : null} onRange={setRange} />
      <main className={`${WIDTH} pb-16`}>
        <Hero />
        {metrics.status === 'loading' && <Notice title="Reading the latest numbers…" />}
        {metrics.status === 'empty' && (
          <Notice
            title="No numbers yet"
            body="The first collection runs the morning after the GoatCounter key is added to the repository. Come back then."
          />
        )}
        {metrics.status === 'error' && (
          <Notice title="The numbers couldn’t be loaded" body="Check your connection and reload the page." />
        )}
        {metrics.status === 'ready' && <Report file={metrics.file} range={range} />}
        <Footer />
      </main>
    </>
  )
}

function Header({ file, range, onRange }) {
  return (
    <header className="z-20 border-b lg:sticky lg:top-0 border-white/[0.08] bg-[#03134F]/75 backdrop-blur-md">
      <div className={`${WIDTH} flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3`}>
        <a href={APP_URL} className="flex min-h-[44px] items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#C4E878]">
          {/* The ALX wordmark, drawn in white through its own shape. */}
          <span
            role="img"
            aria-label="ALX"
            className="block h-7 w-[55px] flex-none bg-white"
            style={{ maskImage: `url("${logo}")`, WebkitMaskImage: `url("${logo}")`, maskSize: 'contain', WebkitMaskSize: 'contain', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }}
          />
          <span className="border-s border-white/20 ps-3 leading-none">
            <span className="block text-sm font-bold tracking-tight text-white">Pace</span>
            <span className="block text-[11px] font-medium text-[#A9B3D6]">Learner pulse</span>
          </span>
        </a>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {file?.updatedAt && (
            <p className="flex items-center gap-2 text-xs text-[#A9B3D6]">
              <span aria-hidden="true" className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C4E878] opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#C4E878]" />
              </span>
              Updated {new Date(file.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })} WAT
            </p>
          )}
          {range != null && <RangeFilter value={range} onChange={onRange} />}
        </div>
      </div>
    </header>
  )
}

/** The date range, as the report's filter boxes have it: a white box, the choice in navy. */
function RangeFilter({ value, onChange }) {
  return (
    <div role="group" aria-label="Date range" className="flex items-center gap-2 rounded-2xl bg-white p-1 ps-4 text-[#03134F] shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
      <span aria-hidden="true" className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5A6690] sm:inline">
        Date range
      </span>
      <span className="flex">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={value === r.id}
            onClick={() => onChange(r.id)}
            className={`min-h-[44px] rounded-xl px-3.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#0452F0] ${
              value === r.id ? 'bg-[#03134F] text-white' : 'text-[#03134F] hover:bg-[#03134F]/[0.07]'
            }`}
          >
            {r.label}
          </button>
        ))}
      </span>
    </div>
  )
}

const OFFSETS = [10, -14, 4, -22, 8]

function Hero() {
  return (
    <section className="grid items-center gap-10 py-10 lg:grid-cols-12 lg:py-16">
      <div className="lg:col-span-7">
        <p className="pulse-label">Data Analytics · ALX Pace</p>
        <h1 className="mt-3 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl xl:text-6xl">
          How learners use Pace, <span className="text-[#C4E878]">day by day.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base text-[#A9B3D6]">
          Anonymous counts from the ALX Pace app, collected every morning. No names, no accounts, nothing that identifies a learner.
        </p>
        <figure className="mt-8 max-w-xl border-s-2 border-[#C4E878] ps-5">
          <blockquote className="text-sm italic leading-relaxed text-[#E8ECFA]">
            “When you can measure what you are speaking about, and express it in numbers, you know something about it.”
          </blockquote>
          <figcaption className="mt-2 text-xs text-[#8A95BF]">William Thomson, Lord Kelvin, 1883</figcaption>
        </figure>
      </div>
      <div className="relative lg:col-span-5">
        <div aria-hidden="true" className="absolute inset-0 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(4,82,240,0.45),transparent)] blur-2xl" />
        <ul className="flex items-center justify-center gap-2 py-6 lg:justify-end xl:gap-3" aria-label="ALX learners">
          {PORTRAITS.map((src, i) => (
            <li key={src} style={{ transform: `translateY(${OFFSETS[i]}px)` }}>
              <img
                src={src}
                alt=""
                width="80"
                height="80"
                className="h-14 w-14 rounded-[20px] border-2 border-[#020B33] object-cover shadow-[0_0_0_1px_rgba(196,232,120,0.4),0_12px_32px_rgba(4,82,240,0.45)] sm:h-20 sm:w-20 lg:h-16 lg:w-16 xl:h-20 xl:w-20"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Notice({ title, body }) {
  return (
    <section className="pulse-card text-center" role="status">
      <p className="text-lg font-semibold text-white">{title}</p>
      {body && <p className="mx-auto mt-2 max-w-md text-sm text-[#A9B3D6]">{body}</p>}
    </section>
  )
}

/** "up 12% on", "down 3% on", "the same as": a change in words, for a sentence. */
function changeWords(x) {
  if (x == null || !Number.isFinite(x)) return null
  const p = Math.round(x * 100)
  return p === 0 ? 'the same as' : `${p > 0 ? 'up' : 'down'} ${Math.abs(p)}% on`
}

const Em = ({ children }) => <strong className="font-semibold text-white">{children}</strong>

function Report({ file, range }) {
  const view = useMemo(() => {
    const to = lastCompleteDay(file)
    const first = file.firstDay
    // No range reaches back past the first day on record: days before it
    // would count as zeros and pull every average down.
    const asked = range === 'all' ? first : addDays(to, -(range - 1))
    const from = asked < first ? first : asked
    const length = daysBetween(from, to) + 1
    const rows = series(file.days, from, to, PROGRAM)
    const prior = summarize(series(file.days, addDays(from, -length), addDays(from, -1), PROGRAM))
    // The average line takes the six days before the range, so it starts on
    // its first day, but only days on record: before the first one it waits
    // for seven, rather than count the days before as zeros.
    const leadFrom = addDays(from, -6) < first ? first : addDays(from, -6)
    const lead = series(file.days, leadFrom, to, PROGRAM)
    const average = movingAverage(lead, (r) => r.active).slice(daysBetween(leadFrom, from))
    const s = summarize(rows)
    const weekKeys = [...new Set([...DA_WEEKS, ...Object.keys(s.weeks)])].sort(byWeek)
    const weeks = weekKeys.map((w) => ({
      week: w,
      avg: (s.weeks[w] ?? 0) / rows.length,
      pace: s.weekStatus[w] ?? null,
    }))
    const paceFrom = rows.find((r) => Object.keys(r.weekStatus).length > 0)?.day ?? null
    // A comparison needs the whole period before to be on record: days before
    // the first one read as zero, and "↑ 881%" against them says nothing.
    const hasPrior = addDays(from, -length) >= first
    return { from, to, length, rows, average, s, prior, weeks, paceFrom, hasPrior }
  }, [file, range])

  const { s, prior, rows, length } = view
  const versus = view.hasPrior ? `the ${length} days before` : null
  const period = view.from === file.firstDay ? 'since counting began' : `over these ${length} days`
  const rangeText = `${fmtDay(view.from)} – ${fmtDay(view.to, { day: 'numeric', month: 'short', year: 'numeric' })}`
  const paceAll = STATUSES.reduce((a, k) => a + s.status[k], 0)
  const priorPaceAll = STATUSES.reduce((a, k) => a + prior.status[k], 0)
  // Days with learners but no pace: from 4 Oct the old pace event was mostly
  // refused (see readDay), and those days read as not counted.
  const unpaced = rows.filter((r) => r.active > 0 && STATUSES.every((k) => r.status[k] === 0)).length
  const rhythm = weekdayPattern(rows)
  const topWeek = view.weeks.reduce((best, w) => (w.avg > (best?.avg ?? 0) ? w : best), null)
  const behindWeek = view.paceFrom ? mostBehindWeek(s.weekStatus) : null
  const activeChange = view.hasPrior ? change(s.avgActive, prior.avgActive) : null
  // "Compared with" only when something on the page is.
  const compared = activeChange != null || (view.hasPrior && priorPaceAll > 0)
  const peakDays = s.peak ? rows.filter((r) => r.active === s.peak.active).length : 0
  const avgText = fmtAvg(s.avgActive)
  const dayName = (day) => fmtDay(day, { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-white/[0.08] pt-6">
        <h2 className="text-lg font-semibold text-white">At a glance</h2>
        <p className="text-sm text-[#A9B3D6]">
          {rangeText}
          {compared && <span className="text-[#8A95BF]"> · compared with {versus}</span>}
        </p>
      </div>

      <section className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Figures at a glance">
        <div className="pulse-card flex min-w-0 flex-col sm:col-span-2 lg:col-span-1">
          <p className="pulse-label">Active learners a day</p>
          <div className="mt-4 flex items-end gap-3">
            <p className="text-6xl font-semibold leading-none tracking-tight text-white">{avgText}</p>
            <Delta value={activeChange} />
          </div>
          <p className="mt-2 text-xs text-[#A9B3D6]">On average, {period}</p>
          <div className="mt-auto pt-6">
            <Sparkline values={rows.map((r) => r.active)} height={64} />
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/[0.08] pt-4">
            <div>
              <dt className="text-xs text-[#A9B3D6]">Learner-days</dt>
              <dd className="mt-1 text-xl font-semibold text-white">{fmtInt(s.learnerDays)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[#A9B3D6]">Busiest day</dt>
              <dd className="mt-1 text-xl font-semibold text-white">
                {s.peak ? fmtInt(s.peak.active) : '–'}
                {s.peak && <span className="ms-2 text-xs font-normal text-[#A9B3D6]">{fmtDay(s.peak.day, { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
              </dd>
            </div>
          </dl>
        </div>

        <div className="pulse-card flex min-w-0 flex-col">
          <p className="pulse-label">Keeping pace</p>
          <div className="mt-6 flex-1">
            <PaceDial counts={s.status} label={`Pace: ${PACE_ORDER.map((k) => `${PACE[k].label.toLowerCase()} ${fmtPct(s.statusShare[k])}`).join(', ')}`} />
          </div>
          <p className="mt-3 text-center text-xs text-[#A9B3D6]">of learners on track or ahead</p>
          <ul className="mt-5 grid grid-cols-3 gap-2 border-t border-white/[0.08] pt-4">
            {PACE_ORDER.map((k) => (
              <li key={k}>
                <p className="flex items-center gap-1.5 text-xs text-[#A9B3D6]">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: PACE[k].color }} />
                  {PACE[k].label}
                </p>
                <p className="mt-1 text-xl font-semibold text-white">{fmtPct(s.statusShare[k])}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="pulse-card flex min-w-0 flex-col">
          <p className="pulse-label">Installed app</p>
          <div className="mt-6 flex-1">
            <MeterDial share={s.installedShare} label={`${fmtPct(s.installedShare)} of visits from the home screen`} />
          </div>
          <p className="mt-3 text-center text-xs text-[#A9B3D6]">of visits were from the home screen</p>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/[0.08] pt-4">
            <div>
              <dt className="text-xs text-[#A9B3D6]">Home screen</dt>
              <dd className="mt-1 text-xl font-semibold text-white">{fmtInt(s.installed)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[#A9B3D6]">Browser</dt>
              <dd className="mt-1 text-xl font-semibold text-white">{fmtInt(s.browser)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <Question
        number="01"
        kicker="Activity"
        title="When do learners use Pace?"
        text={
          s.learnerDays === 0 ? (
            <p>No learners were counted in these days.</p>
          ) : (
            <>
              <p>
                <Em>
                  {avgText === '<0.1' ? 'Fewer than 1 learner' : `${avgText} ${avgText === '1' ? 'learner' : 'learners'}`}
                </Em>{' '}
                opened Pace on an average day {period}
                {activeChange != null && `, ${changeWords(activeChange)} ${versus}`}.
              </p>
              {s.peak &&
                (peakDays === 1 ? (
                  <p>
                    The busiest day was <Em>{dayName(s.peak.day)}</Em>, with <Em>{fmtInt(s.peak.active)}</Em>.
                  </p>
                ) : (
                  <p>
                    The most on one day was <Em>{fmtInt(s.peak.active)}</Em>, reached on <Em>{peakDays} days</Em>.
                  </p>
                ))}
              {rhythm && (
                <p>
                  Week on week,{' '}
                  {rhythm.busiest != null && (
                    <>
                      <Em>{WEEKDAYS[rhythm.busiest]}</Em> are the busiest
                    </>
                  )}
                  {rhythm.busiest != null && rhythm.quietest != null && ' and '}
                  {rhythm.quietest != null && (
                    <>
                      <Em>{WEEKDAYS[rhythm.quietest]}</Em> {rhythm.busiest != null ? 'the quietest' : 'are the quietest'}
                    </>
                  )}
                  .
                </p>
              )}
              <p className="text-[#8A95BF]">Each column is a day; the lime line is the 7-day average, which smooths out the weekly rhythm.</p>
            </>
          )
        }
      >
        <ChartCard
          title="Active learners per day"
          subtitle="Each learner counted once a day"
          legend={<Legend items={[{ label: 'Learners that day', color: DAILY }, { label: '7-day average', color: LIME, line: true }]} />}
          table={
            <DataTable
              head={['Day', 'Learners', '7-day average']}
              rows={rows.map((r, i) => [fmtDay(r.day, { weekday: 'short', day: 'numeric', month: 'short' }), fmtInt(r.active), view.average[i] == null ? '–' : fmtOne(view.average[i])])}
            />
          }
        >
          <DailyActiveChart rows={rows} average={view.average} label="Active learners per day, with the 7-day average" />
        </ChartCard>
      </Question>

      <Question
        number="02"
        kicker="Pace"
        title="Are learners keeping pace?"
        text={
          paceAll === 0 ? (
            <>
              <p>No pace was counted in these days.</p>
              {unpaced > 0 && <UnpacedNote />}
            </>
          ) : (
            <>
              <p>
                Counting each learner once a day, <Em>{fmtPct(s.statusShare.behind)}</Em> were behind, <Em>{fmtPct(s.statusShare['on-track'])}</Em> on track and{' '}
                <Em>{fmtPct(s.statusShare.ahead)}</Em> ahead.
              </p>
              {view.hasPrior && priorPaceAll > 0 && (
                <p>
                  {fmtPct(prior.statusShare.behind) === fmtPct(s.statusShare.behind) ? (
                    <>The share behind is the same as in {versus}.</>
                  ) : (
                    <>
                      The share behind was <Em>{fmtPct(prior.statusShare.behind)}</Em> in {versus}.
                    </>
                  )}
                </p>
              )}
              {unpaced > 0 && <UnpacedNote days={unpaced} />}
              <p className="text-[#8A95BF]">A learner who is behind sees their oldest overdue lessons first when they open Pace.</p>
            </>
          )
        }
      >
        <ChartCard
          title="Pace mix per day"
          subtitle="Share of the day’s learners behind, on track and ahead"
          legend={<Legend items={PACE_ORDER.map((k) => ({ label: PACE[k].label, color: PACE[k].color }))} />}
          table={
            <DataTable
              head={['Day', 'Behind', 'On track', 'Ahead']}
              rows={rows.map((r) => [fmtDay(r.day, { weekday: 'short', day: 'numeric', month: 'short' }), ...PACE_ORDER.map((k) => fmtInt(r.status[k]))])}
            />
          }
        >
          <PaceMixChart rows={rows} label="Pace mix per day" />
        </ChartCard>
      </Question>

      <Question
        number="03"
        kicker="Progress"
        title="Where in the course are learners?"
        text={
          !topWeek ? (
            <p>No learner was counted in a week of the course in these days.</p>
          ) : (
            <>
              <p>
                The most learners are in <Em>Week {topWeek.week}</Em>,{' '}
                {fmtAvg(topWeek.avg) === '<0.1' ? 'though fewer than 1 a day' : <>about <Em>{fmtOne(topWeek.avg)}</Em> a day</>}.
              </p>
              {behindWeek && (
                <p>
                  Being behind is most common in <Em>Week {behindWeek.week}</Em>, where <Em>{fmtPct(behindWeek.share)}</Em> of learners are behind.
                </p>
              )}
              <p className="text-[#8A95BF]">
                Each column is a week of the course
                {view.paceFrom ? `; the strip under it splits that week’s learners by pace, counted from ${fmtDay(view.paceFrom)}.` : '.'}
              </p>
            </>
          )
        }
      >
        <ChartCard
          title="Learners a day in each week"
          subtitle="The week each learner is in, by the course calendar"
          legend={
            <Legend
              items={[
                { label: 'Learners a day', color: LIME },
                ...(view.paceFrom ? PACE_ORDER.map((k) => ({ label: PACE[k].label, color: PACE[k].color })) : []),
              ]}
            />
          }
          table={
            <DataTable
              head={['Week', 'Learners a day', 'Behind', 'On track', 'Ahead']}
              rows={view.weeks.map((w) => [`Week ${w.week}`, w.avg > 0 ? fmtOne(w.avg) : '–', ...PACE_ORDER.map((k) => (w.pace ? fmtInt(w.pace[k]) : '–'))])}
            />
          }
        >
          <WeeksChart weeks={view.weeks} label="Learners a day in each week of the course" />
        </ChartCard>
      </Question>
    </>
  )
}

/** Why some days have learners but no pace. */
function UnpacedNote({ days }) {
  return (
    <p>
      {days ? `On ${days} ${days === 1 ? 'day' : 'days'} with learners, pace wasn’t counted` : 'Pace wasn’t counted'}: from 4 October
      until the app was updated, GoatCounter refused most learners’ pace. Those days are left out of the shares, and show no column.
    </p>
  )
}

/** One question, what the chart says about it written beside it, and the chart. */
function Question({ number, kicker, title, text, children }) {
  return (
    <section className="mt-14 grid gap-6 lg:mt-20 lg:grid-cols-12 lg:gap-10" aria-label={title}>
      <div className="relative lg:col-span-4 lg:pe-10 lg:pt-2">
        <p className="pulse-label flex items-center gap-2">
          <span aria-hidden="true" className="h-[2px] w-5 rounded-full bg-[#C4E878]" />
          {number} · {kicker}
        </p>
        <h2 className="mt-3 text-2xl font-semibold leading-snug tracking-tight text-white xl:text-3xl">{title}</h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#A9B3D6]">{text}</div>
        <span aria-hidden="true" className="absolute inset-y-0 end-0 hidden w-[2px] rounded-full bg-gradient-to-b from-[#C4E878] via-[#C4E878]/25 to-transparent lg:block" />
      </div>
      <div className="min-w-0 lg:col-span-8">{children}</div>
    </section>
  )
}

function Delta({ value }) {
  const d = fmtChange(value)
  if (!d) return null
  return (
    <span
      className={`mb-1 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${d.level ? 'bg-white/10 text-[#E8ECFA]' : d.up ? 'bg-[#C4E878]/15 text-[#C4E878]' : 'bg-white/10 text-[#E8ECFA]'}`}
    >
      {d.text}
    </span>
  )
}

function ChartCard({ title, subtitle, legend, table, children, className = '' }) {
  const [asTable, setAsTable] = useState(false)
  return (
    <section className={`pulse-card ${className}`} aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-1 text-xs text-[#A9B3D6]">{subtitle}</p>
        </div>
        <button type="button" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable} className="pulse-button -me-2 -mt-2 flex-none text-xs text-[#A9B3D6]">
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {legend && !asTable && <div className="mt-3">{legend}</div>}
      <div className="mt-4">{asTable ? table : children}</div>
    </section>
  )
}

function DataTable({ head, rows }) {
  return (
    <div className="max-h-80 overflow-auto rounded-2xl border border-white/[0.06]">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-[#0B1645] text-[#A9B3D6]">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums text-[#E8ECFA]">
          {rows.map((r) => (
            <tr key={r[0]} className="border-t border-white/[0.05]">
              {r.map((c, i) => (
                <td key={i} className="px-3 py-1.5">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Footer() {
  return (
    <footer className="mt-20 border-t border-white/[0.08] pt-6 text-xs leading-relaxed text-[#8A95BF]">
      <p className="pulse-label">How these numbers are counted</p>
      <ul className="mt-3 grid gap-x-10 gap-y-2 sm:grid-cols-2">
        <li>
          A learner is a device with a Data Analytics course under way (start date set, course not yet finished) that opened the app that
          day, counted once however often it was opened.
        </li>
        <li>Learners whose browser asks not to be tracked (Do Not Track, Global Privacy Control) are not counted, so these are a floor.</li>
        <li>Week is the learner’s week by the course calendar, from their start date; pace is worked out from the lessons they have ticked.</li>
        <li>A visit is the app opened from one browser; opens within 8 hours of each other are one visit.</li>
      </ul>
      <p className="mt-4">
        Collected from{' '}
        <a href="https://www.goatcounter.com" className="text-[#C4E878] underline-offset-2 hover:underline">
          GoatCounter
        </a>{' '}
        every morning ·{' '}
        <a href={APP_URL} className="text-[#C4E878] underline-offset-2 hover:underline">
          Open ALX Pace
        </a>
      </p>
    </footer>
  )
}
