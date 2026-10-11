import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import { axis, fmtDay, fmtInt, fmtOne, fmtPct } from './format.js'
import { DAILY, GRID, LIME, PACE, PACE_ORDER, SURFACE } from './palette.js'

/*
  The dashboard's charts, drawn as plain SVG: no chart library, so the page
  stays small and every mark follows the same few rules (the dataviz specs):
  hairline grid, 2px lines, bars capped at 24px with a 4px rounded end on a
  square baseline, a 2px surface gap between touching segments, a 2px surface
  ring on dots. Every chart has a hover and keyboard read-out, and a table
  view in its card (see Dashboard), so no number depends on hovering.
*/

/** The width of an element, kept current as it resizes. */
export function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/** A bar or column with a 4px rounded data end and a square end on the baseline. */
function barPath(x, y, w, h, { horizontal = false } = {}) {
  if (w <= 0 || h <= 0) return ''
  const r = Math.min(4, horizontal ? h / 2 : w / 2, horizontal ? w : h)
  if (horizontal) {
    // Grows rightwards from x; the data end is on the right.
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`
  }
  // Grows upwards from the baseline at y + h; the data end is on top.
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

/**
 * What a chart reads out for the day or week in hand: the tooltip on screen,
 * and the same words in a live region, so a screen reader speaks each one as
 * the arrow keys move (the svg itself is hidden from it).
 */
function Readout({ item, ...tooltip }) {
  return (
    <>
      <p className="sr-only" aria-live="polite">
        {item ? `${tooltip.title}: ${tooltip.rows.map((r) => `${r.value} ${r.label}`).join(', ')}` : ''}
      </p>
      {item && <Tooltip {...tooltip} />}
    </>
  )
}

/** Pointer handlers for a chart: hover reads, a tap reads and stays until the next. */
function pointerProps(pick, setIndex) {
  return {
    onPointerMove: pick,
    onPointerDown: pick,
    onPointerLeave: (e) => e.pointerType !== 'touch' && setIndex(null),
  }
}

const plural = (value, one, many) => (value === '1' ? one : many)

/** The read-out: values lead, names follow, each keyed by a short line of its colour. */
function Tooltip({ x, y, width, title, rows }) {
  const left = Math.max(8, Math.min(x + 12, width - 188))
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 w-[180px] rounded-2xl border border-white/10 bg-[#040D3A]/95 px-3 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur"
      style={{ left, top: Math.max(0, y) }}
    >
      <p className="text-[11px] font-medium text-[#A9B3D6]">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-xs">
            <span aria-hidden="true" className="h-[3px] w-3 flex-none rounded-full" style={{ background: r.color }} />
            <span className="font-semibold text-white">{r.value}</span>
            <span className="text-[#A9B3D6]">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Keyboard reading for a chart over days or rows: arrows move, Home/End jump, Escape leaves. */
function useKeyedIndex(count) {
  const [index, setIndex] = useState(null)
  const onKeyDown = useCallback(
    (e) => {
      if (!count) return
      const moves = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
      if (e.key in moves) {
        e.preventDefault()
        setIndex((i) => Math.max(0, Math.min(count - 1, (i ?? (moves[e.key] > 0 ? -1 : count)) + moves[e.key])))
      } else if (e.key === 'Home') {
        e.preventDefault()
        setIndex(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setIndex(count - 1)
      } else if (e.key === 'Escape') {
        setIndex(null)
      }
    },
    [count],
  )
  return [index, setIndex, onKeyDown]
}

const PAD = { top: 14, right: 16, bottom: 30, left: 34 }

/** The x positions of a run of days: a band each, a column centred in it. */
function dayBands(n, width) {
  const plot = Math.max(0, width - PAD.left - PAD.right)
  const band = n > 0 ? plot / n : 0
  return { band, centre: (i) => PAD.left + band * (i + 0.5) }
}

/** A few date labels along the bottom: the ends, and evenly between. */
function dateTicks(rows, centre, width) {
  if (rows.length === 0) return null
  const room = Math.max(2, Math.floor((width - PAD.left - PAD.right) / 72))
  const step = Math.max(1, Math.ceil((rows.length - 1) / (room - 1)))
  const picks = []
  for (let i = 0; i < rows.length; i += step) picks.push(i)
  if (picks.at(-1) !== rows.length - 1) {
    if (rows.length - 1 - picks.at(-1) < step / 2) picks.pop()
    picks.push(rows.length - 1)
  }
  return picks.map((i) => (
    <text key={i} x={centre(i)} y={0} textAnchor={i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'} dx={i === 0 ? -4 : i === rows.length - 1 ? 4 : 0}>
      {fmtDay(rows[i].day)}
    </text>
  ))
}

function YGrid({ ticks, y, width, format = fmtInt }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
          <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[#8A95BF] text-[10px] tabular-nums">
            {format(t)}
          </text>
        </g>
      ))}
    </g>
  )
}

/**
 * Active learners per day (muted columns) and their 7-day average (the lime
 * line, the point of the chart, labelled at its end).
 */
export function DailyActiveChart({ rows, average, label }) {
  const [ref, width] = useWidth()
  const [index, setIndex, onKeyDown] = useKeyedIndex(rows.length)
  const glow = useId().replace(/:/g, '')
  const height = 240
  const { band, centre } = dayBands(rows.length, width)
  const { max, ticks } = axis(Math.max(1, ...rows.map((r) => r.active), ...average.filter((v) => v != null)))
  const plotH = height - PAD.top - PAD.bottom
  const y = (v) => PAD.top + plotH - (v / max) * plotH
  const barW = Math.max(1, Math.min(24, band * 0.58))

  const linePoints = average.map((v, i) => (v == null ? null : [centre(i), y(v)]))
  let d = ''
  linePoints.forEach((p, i) => {
    if (!p) return
    d += `${linePoints[i - 1] ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`
  })
  const lastAvgIndex = average.findLastIndex((v) => v != null)

  const onPointer = (e) => {
    const box = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - box.left - PAD.left) / band)
    setIndex(i >= 0 && i < rows.length ? i : null)
  }

  const hovered = index != null ? rows[index] : null
  return (
    <div ref={ref} className="relative">
      <div
        tabIndex={0}
        role="group"
        aria-label={`${label}. Use the arrow keys to read each day, or Show table for all of them.`}
        onKeyDown={onKeyDown}
        {...pointerProps(onPointer, setIndex)}
        onBlur={() => setIndex(null)}
        className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#C4E878]"
      >
        {width > 0 && (
          <svg width={width} height={height} aria-hidden="true" className="block overflow-visible">
            <defs>
              {/* In user space: a flat line has no height, and a box-relative region would hide it. */}
              <filter id={glow} filterUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <YGrid ticks={ticks} y={y} width={width} />
            {rows.map((r, i) => (
              <path
                key={r.day}
                d={barPath(centre(i) - barW / 2, y(r.active), barW, y(0) - y(r.active))}
                fill={index === i ? 'rgba(196, 232, 120, 0.55)' : DAILY}
              />
            ))}
            {d && <path d={d} fill="none" stroke={LIME} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" filter={`url(#${glow})`} />}
            {lastAvgIndex >= 0 && (
              <circle cx={centre(lastAvgIndex)} cy={y(average[lastAvgIndex])} r="4" fill={LIME} stroke={SURFACE} strokeWidth="2" />
            )}
            {hovered && (
              <line x1={centre(index)} x2={centre(index)} y1={PAD.top} y2={height - PAD.bottom} stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
            )}
            <g transform={`translate(0, ${height - 8})`} className="fill-[#8A95BF] text-[10px]">
              {dateTicks(rows, centre, width)}
            </g>
          </svg>
        )}
      </div>
      <Readout
        item={hovered}
        x={hovered ? centre(index) : 0}
        y={8}
        width={width}
        title={hovered ? fmtDay(hovered.day, { weekday: 'short', day: 'numeric', month: 'short' }) : ''}
        rows={
          hovered
            ? [
                { label: plural(fmtInt(hovered.active), 'learner that day', 'learners that day'), value: fmtInt(hovered.active), color: DAILY },
                ...(average[index] != null ? [{ label: '7-day average', value: fmtOne(average[index]), color: LIME }] : []),
              ]
            : []
        }
      />
    </div>
  )
}

/** Pace mix per day: one 100% column a day, behind at the bottom, ahead on top. */
export function PaceMixChart({ rows, label }) {
  const [ref, width] = useWidth()
  const [index, setIndex, onKeyDown] = useKeyedIndex(rows.length)
  const height = 200
  const { band, centre } = dayBands(rows.length, width)
  const plotH = height - PAD.top - PAD.bottom
  const y = (share) => PAD.top + plotH - share * plotH
  const barW = Math.max(1, Math.min(24, band * 0.58))
  const GAP = 2

  const onPointer = (e) => {
    const box = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - box.left - PAD.left) / band)
    setIndex(i >= 0 && i < rows.length ? i : null)
  }
  const hovered = index != null ? rows[index] : null
  const totalOf = (r) => PACE_ORDER.reduce((a, s) => a + r.status[s], 0)

  return (
    <div ref={ref} className="relative">
      <div
        tabIndex={0}
        role="group"
        aria-label={`${label}. Use the arrow keys to read each day, or Show table for all of them.`}
        onKeyDown={onKeyDown}
        {...pointerProps(onPointer, setIndex)}
        onBlur={() => setIndex(null)}
        className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#C4E878]"
      >
        {width > 0 && (
          <svg width={width} height={height} aria-hidden="true" className="block overflow-visible">
            <YGrid ticks={[0, 0.5, 1]} y={y} width={width} format={(t) => `${t * 100}%`} />
            {rows.map((r, i) => {
              const total = totalOf(r)
              if (!total) return null
              let base = 0
              const present = PACE_ORDER.filter((s) => r.status[s] > 0)
              return (
                <g key={r.day} opacity={index == null || index === i ? 1 : 0.45}>
                  {PACE_ORDER.map((s) => {
                    const share = r.status[s] / total
                    if (!share) return null
                    const top = base + share
                    const isTop = s === present.at(-1)
                    const y0 = y(base) - (base > 0 ? GAP / 2 : 0)
                    const y1 = y(top) + (isTop ? 0 : GAP / 2)
                    base = top
                    const h = Math.max(0, y0 - y1)
                    const x = centre(i) - barW / 2
                    return isTop ? (
                      <path key={s} d={barPath(x, y1, barW, h)} fill={PACE[s].color} />
                    ) : (
                      <rect key={s} x={x} y={y1} width={barW} height={h} fill={PACE[s].color} />
                    )
                  })}
                </g>
              )
            })}
            <g transform={`translate(0, ${height - 8})`} className="fill-[#8A95BF] text-[10px]">
              {dateTicks(rows, centre, width)}
            </g>
          </svg>
        )}
      </div>
      <Readout
        item={hovered}
        x={hovered ? centre(index) : 0}
        y={8}
        width={width}
        title={hovered ? fmtDay(hovered.day, { weekday: 'short', day: 'numeric', month: 'short' }) : ''}
        rows={
          !hovered
            ? []
            : totalOf(hovered) > 0
              ? [...PACE_ORDER].reverse().map((s) => ({
                  label: `${PACE[s].label.toLowerCase()} (${fmtInt(hovered.status[s])})`,
                  value: fmtPct(hovered.status[s] / totalOf(hovered)),
                  color: PACE[s].color,
                }))
              : [{ label: 'not counted', value: 'Pace', color: GRID }]
        }
      />
    </div>
  )
}

/**
 * Where learners are: a column for each week of the course, as tall as the
 * learners a day in it on average (lime, its value on the cap), and under it,
 * where counted, a strip split by how that week's learners were pacing.
 */
export function WeeksChart({ weeks, label }) {
  const [ref, width] = useWidth()
  const [index, setIndex, onKeyDown] = useKeyedIndex(weeks.length)
  const height = 200
  const pad = { top: 18, right: 4, bottom: 34, left: 4 }
  const n = weeks.length
  const band = n > 0 ? (width - pad.left - pad.right) / n : 0
  const centre = (i) => pad.left + band * (i + 0.5)
  const barW = Math.max(1, Math.min(24, band * 0.58))
  const plotH = height - pad.top - pad.bottom
  const max = Math.max(1e-9, ...weeks.map((w) => w.avg))
  const y = (v) => pad.top + plotH - (v / max) * plotH
  const base = y(0)
  const STRIP = 6
  const GAP = 2
  const paceTotal = (p) => (p ? PACE_ORDER.reduce((a, k) => a + p[k], 0) : 0)

  const onPointer = (e) => {
    const box = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - box.left - pad.left) / band)
    setIndex(i >= 0 && i < n ? i : null)
  }
  const hovered = index != null ? weeks[index] : null

  return (
    <div ref={ref} className="relative">
      <div
        tabIndex={0}
        role="group"
        aria-label={`${label}. Use the arrow keys to read each week, or Show table for all of them.`}
        onKeyDown={onKeyDown}
        {...pointerProps(onPointer, setIndex)}
        onBlur={() => setIndex(null)}
        className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#C4E878]"
      >
        {width > 0 && (
          <svg width={width} height={height} aria-hidden="true" className="block overflow-visible">
            <line x1={pad.left} x2={width - pad.right} y1={base} y2={base} stroke={GRID} strokeWidth="1" />
            {weeks.map((w, i) => {
              const x = centre(i) - barW / 2
              const total = paceTotal(w.pace)
              let left = x
              return (
                <g key={w.week} opacity={index == null || index === i ? 1 : 0.5}>
                  {w.avg > 0 && <path d={barPath(x, y(w.avg), barW, base - y(w.avg))} fill={LIME} />}
                  {w.avg > 0 && band >= 22 && (
                    <text x={centre(i)} y={y(w.avg) - 6} textAnchor="middle" className="fill-[#E8ECFA] text-[10px] font-semibold">
                      {fmtOne(w.avg)}
                    </text>
                  )}
                  {total > 0 &&
                    PACE_ORDER.filter((k) => w.pace[k] > 0).map((k, j, present) => {
                      const segW = Math.max(0, (barW - GAP * (present.length - 1)) * (w.pace[k] / total))
                      const seg = <rect key={k} x={left} y={base + 6} width={segW} height={STRIP} rx="1" fill={PACE[k].color} />
                      left += segW + GAP
                      return seg
                    })}
                  <text x={centre(i)} y={height - 8} textAnchor="middle" className="fill-[#8A95BF] text-[10px]">
                    {w.week}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
      </div>
      <Readout
        item={hovered}
        x={hovered ? centre(index) : 0}
        y={8}
        width={width}
        title={hovered ? `Week ${hovered.week}` : ''}
        rows={
          !hovered
            ? []
            : [
            { label: plural(fmtOne(hovered.avg), 'learner a day', 'learners a day'), value: hovered.avg > 0 ? fmtOne(hovered.avg) : '0', color: LIME },
            ...(paceTotal(hovered.pace) > 0
              ? [...PACE_ORDER].reverse().map((k) => ({
                  label: PACE[k].label.toLowerCase(),
                  value: fmtPct(hovered.pace[k] / paceTotal(hovered.pace)),
                  color: PACE[k].color,
                }))
              : []),
              ]
        }
      />
    </div>
  )
}

/** A sparkline for the headline figure: the series in lime, a 10% wash under it, a dot at its end. */
export function Sparkline({ values, height = 48 }) {
  const [ref, width] = useWidth()
  const n = values.length
  const max = Math.max(1, ...values)
  const x = (i) => (n > 1 ? (i / (n - 1)) * (width - 8) + 4 : width / 2)
  const y = (v) => 4 + (height - 8) * (1 - v / max)
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = n > 1 ? `${line}L${x(n - 1).toFixed(1)},${height}L${x(0).toFixed(1)},${height}Z` : ''
  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {width > 0 && n > 0 && (
        <svg width={width} height={height} aria-hidden="true" className="block overflow-visible">
          {area && <path d={area} fill={LIME} opacity="0.1" />}
          <path d={line} fill="none" stroke={LIME} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(n - 1)} cy={y(values[n - 1])} r="4" fill={LIME} stroke={SURFACE} strokeWidth="2" />
        </svg>
      )}
    </div>
  )
}

/*
  The dials: a half circle read left to right, 0 to 100%, with a hairline
  scale around it. Arc lengths are exact (square ends, no caps overshooting
  the value) and touching segments are parted by a 2px gap of the card.
*/
const DIAL = { w: 240, h: 132, cx: 120, cy: 120, r: 96, stroke: 14 }
const ARC_LENGTH = Math.PI * DIAL.r

/** A point on the dial, `t` from 0 (the left end) to 1 (the right end), over the top. */
function dialPoint(t, r = DIAL.r) {
  const a = Math.PI * (1 - t)
  return [DIAL.cx + r * Math.cos(a), DIAL.cy - r * Math.sin(a)]
}

function arcPath(t0, t1) {
  const [x0, y0] = dialPoint(t0)
  const [x1, y1] = dialPoint(t1)
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${DIAL.r},${DIAL.r} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`
}

function Dial({ label, value, children }) {
  const outer = DIAL.r + DIAL.stroke / 2
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <svg viewBox={`0 0 ${DIAL.w} ${DIAL.h}`} role="img" aria-label={label} className="block w-full overflow-visible">
        {Array.from({ length: 21 }, (_, i) => {
          const major = i % 10 === 0
          const [x0, y0] = dialPoint(i / 20, outer + 4)
          const [x1, y1] = dialPoint(i / 20, outer + (major ? 11 : 7))
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={major ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.14)'} strokeWidth="1" />
        })}
        {children}
      </svg>
      <p className="absolute inset-x-0 bottom-[2%] text-center text-4xl font-semibold leading-none tracking-tight text-white xl:text-5xl">{value}</p>
    </div>
  )
}

/** A dial for a single share: lime on a faint lime track (one ramp), lit at its end. */
export function MeterDial({ share, label }) {
  const glow = useId().replace(/:/g, '')
  const t = share == null ? 0 : Math.max(0, Math.min(1, share))
  const [mx0, my0] = dialPoint(t, DIAL.r - DIAL.stroke / 2 - 5)
  const [mx1, my1] = dialPoint(t, DIAL.r + DIAL.stroke / 2 + 5)
  return (
    <Dial label={label} value={fmtPct(share)}>
      <defs>
        <filter id={glow} filterUnits="userSpaceOnUse" x="0" y="0" width={DIAL.w} height={DIAL.h}>
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d={arcPath(0, 1)} fill="none" stroke={LIME} strokeOpacity="0.14" strokeWidth={DIAL.stroke} />
      {t > 0 && <path d={arcPath(0, t)} fill="none" stroke={LIME} strokeWidth={DIAL.stroke} filter={`url(#${glow})`} />}
      {share != null && <line x1={mx0} y1={my0} x2={mx1} y2={my1} stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />}
    </Dial>
  )
}

/** A dial split by pace, behind to ahead from left to right; the figure is the share keeping pace. */
export function PaceDial({ counts, label }) {
  const total = PACE_ORDER.reduce((a, k) => a + (counts?.[k] ?? 0), 0)
  const keeping = total > 0 ? (counts['on-track'] + counts.ahead) / total : null
  const gap = 2 / ARC_LENGTH
  const present = total > 0 ? PACE_ORDER.filter((k) => counts[k] > 0) : []
  let at = 0
  return (
    <Dial label={label} value={fmtPct(keeping)}>
      {total === 0 && <path d={arcPath(0, 1)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={DIAL.stroke} />}
      {present.map((k, i) => {
        const from = at + (i > 0 ? gap / 2 : 0)
        at += counts[k] / total
        const to = at - (i < present.length - 1 ? gap / 2 : 0)
        return to > from ? <path key={k} d={arcPath(from, to)} fill="none" stroke={PACE[k].color} strokeWidth={DIAL.stroke} /> : null
      })}
    </Dial>
  )
}

/** Swatches for a legend: rect for bars and areas, a short line for lines. */
export function Legend({ items }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#A9B3D6]">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={it.line ? 'h-[3px] w-4 rounded-full' : 'h-2.5 w-2.5 rounded-[3px]'}
            style={{ background: it.color }}
          />
          {it.label}
        </li>
      ))}
    </ul>
  )
}
