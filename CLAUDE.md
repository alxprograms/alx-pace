# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ALX Pace — a zero-login, mobile-first tracker for ALX Africa's self-paced
curricula: Data Analytics (14 weeks) and Creative Tech — Content Creation (22)
and Graphic Design (32). React 18 + Vite + Tailwind 3, deployed as a static PWA
to GitHub Pages. There is no backend and no account system; every byte of learner
state lives in that learner's own browser.

## Commands

```bash
npm run dev            # Vite dev server
npm run build          # production build to dist/
npm run preview        # serve the production build
npm run lint           # ESLint (flat config) — see note below on warnings
npm test               # Vitest, single run
npm run test:watch
npm run parser:check   # runs the PRODUCTION parser against the real CSV in plain Node
```

Run one test file or one case:

```bash
npx vitest run src/lib/pacing.test.js
npx vitest run -t "unions completed lessons"
```

CI gate, in order: `lint → test → parser:check → build`. Deploy runs only after
all four pass on `main`.

`npm run lint` is `eslint .` with no `--max-warnings`, so it **exits 0 when
warnings are present** — a warning passes CI silently. Verified by planting one
and checking the exit code. Read the lint output, don't just check the job went
green.

`npm run parser:check` is not redundant with the test suite: it executes the same
parser **outside Vite**, proving the curriculum model does not depend on bundler
behaviour. Because of that, any standalone Node script must read the CSV with
`fs` — the `?raw` import in `src/lib/schedule.js` only resolves under Vite.

## Deploy topology — two repositories

This is the least guessable thing about the project. Get it wrong and learners
lose data.

| Repo | Remote | Serves |
| --- | --- | --- |
| `alxprograms/alx-pace` | `origin` | The app, at `https://alxprograms.github.io/alx-pace/` |
| `balogvn/alx-pace` | `oldhome` | The **bridge** at the app's former address, from the `bridge` branch |

- The app deploys automatically on push to `main` via `.github/workflows/ci.yml`.
- The app's account was renamed from `alxdataprograms` to `alxprograms` on
  2026-10-05. GitHub Pages does not redirect after a rename, so
  `https://alxdataprograms.github.io/alx-pace/` is gone, and the progress
  learners saved there stayed in their browsers under that address. The owner
  chose a fresh start over a second bridge. Renaming the account again moves
  the app again: put a bridge at the old address first.
- The bridge does **not**. `bridge/index.html` lives in this repo, but the copy
  that is *served* is on the `bridge` branch of `oldhome`. After changing
  anything under `bridge/`, republish that branch and trigger its Pages build,
  or the old address keeps handing over stale payloads.
- The `metrics` branch of `origin` holds data, not code: `metrics.json`, written
  every morning by `.github/workflows/metrics.yml`. It shares no history with
  `main`; never merge it, rebase onto it or push to it by hand. Its commits
  don't deploy (deploys run on `main` only), and the dashboard reads the file
  from raw.githubusercontent.com, so new numbers need no deploy.
- `BASE_PATH=/alx-pace/` is injected only by CI. Local dev and preview serve from
  `/`, so never hardcode the subpath — use `import.meta.env.BASE_URL`.
- The account that owns the app repo is a **personal account**, so it has exactly
  two permission levels. A collaborator can push, open and merge PRs and re-run
  Actions, but Pages settings, secrets and environments require the owner.

### Rolling back

Every deploy that reaches learners is tagged `live-<UTC date>-<time>-<sha>` by
the deploy job. `git tag` is therefore the list of known-good versions — no
reading the log to work out which commit was last live.

```bash
git tag                          # every version that was ever live
git revert <sha> && git push     # ~4 min to redeploy through the full gate
```

There is no faster path. Pages publishes what CI builds, so a rollback is a
commit like any other and runs lint → test → parser → build first. That is the
right trade: the gate is what makes every tagged version trustworthy.

**A revert does not restore learner data.** Progress lives only in each
learner's browser — no backend, no backup, by design. Roll back after a change
that cleared `localStorage` and the old app returns; the ticked lessons do not.
`storage-safety.test.js` guards the structural half of this: only
`useLocalStorage` may remove keys. The half it cannot guard is the CSV — lesson
ids embed the week number, so moving a lesson between weeks invalidates saved
completions, and no revert undoes that.

## Architecture

### Determinism is the design constraint

The curriculum is a fixed developer asset, and everything derived from it is a
pure function. No model, no heuristics, no runtime fetch.

```
src/data/{da,cc,gd}-schedule.csv source of truth (real ALX curricula)
  → programs.js                  registry: id, family, layout ('cyu' | 'activity'), csv
  → csvParser.js                 RFC 4180 state machine + forwardFill for merged cells
  → scheduleModel.js             normalise into {lessons, weeks, modules, totalDays, totalWeeks, …}
  → schedule.js                  Vite ?raw imports, built once at module load → SCHEDULES[id]
```

The learner's `program` key picks which schedule is active; `completedLessons`
and `alx-celebrated` are single arrays shared by every program, safe because ids
are namespaced (`da-…`/`cc-…`/`gd-…`, `module:DA-1`/`module:CC-1`). Anything that
prunes those arrays must only touch the active program's ids.

Lesson ids are **content-derived slugs** (`da-1-w1-ways-of-work`), never row
positions, so inserting a CSV row cannot silently re-map saved progress. They do
embed the week number, so moving a lesson between weeks *does* invalidate saved
completions for it — weigh that before editing the CSV.

`pacing.js` is the clock, and is pure in `(startDate, now, timeline)`:

```
elapsedDays = today − startDate        (whole days, LOCAL midnight)
currentWeek = the week whose [startDay, endDay) holds elapsedDays
```

Creative Tech weeks are not uniform — buffer weeks (`13.5`) and half weeks —
so the week comes from the program's day timeline, not `⌊days / 7⌋`.

Dates are parsed as local, never UTC, so the calendar day cannot shift in
negative offsets. `App.jsx` re-reads the clock every 60s but only commits state
when `toDateString()` changes, so the week rolls over at midnight in a tab left
open without churning renders.

### The learner states

`computePacing` returns exactly one of these, and `App.jsx` is a switch over them:

```
no-program  →  no-start-date  →  future (countdown)  →  active  →  completed
```

`computePaceStatus` returns `null` unless the state is `active`; it classifies
`behind` / `on-track` / `ahead`, with `behind` winning so catch-up is surfaced
first.

### Persistence

`useLocalStorage(key, default, {raw})` is the only way state is persisted. `raw`
stores plain strings; without it, values are JSON. It reads once in a `useState`
initialiser and never re-reads, which is why the origin handoff must run *before*
React mounts.

`useLearnerProfile` sanitises `completedLessons` against the shipped schedule on
every read, dropping unknown or duplicate ids.

Full key contract is in README.md. When adding a key, decide explicitly whether
it should survive an origin change and record that decision — see below.

### The origin handoff

`localStorage` is scoped to the origin, so the move between GitHub accounts would
have erased every learner's progress. `src/lib/handoff.js` plus `bridge/` carry it
across, and the rules encode real reasoning:

- **Fragment, never a query string** — a learner's name must not reach a server
  or an access log.
- **Completed lessons are unioned**; everything else writes only if the new origin
  is empty. A lesson wrongly ticked costs one click; a lesson wrongly cleared is
  indistinguishable from work never done.
- **`alx-reminders` never travels.** Notification permission is origin-scoped, so
  restoring the flag would claim reminders are on with nothing registered to send
  them. A separate advisory field `remindersWereOn` sets `alx-reminders-lapsed`,
  which can only ever produce a *prompt*, never a claim.
- **`alx-metrics-day` never travels** — it would hide a learner's first day on the
  new origin from the analytics.
- **`program` never travels — it is derived.** Everyone at the old address was a
  DA learner, so `applyHandoff` pins `program='da'` when it brings progress and
  no program is chosen here (absent or `''`). `main.jsx` runs the handoff
  *before* `migrateLegacyProgram`; reversed, an arrival would get the picker.
- The bridge cannot import from the app, so its encoder is a hand-mirrored copy.
  `handoff.test.js` reads `bridge/index.html` off disk, extracts the block between
  the `handoff-codec` sentinels and round-trips it against the shipped decoder.
  **If you touch either codec, both must change.**

### Internationalisation

`src/i18n/translations.js` holds `en`, `fr`, `ar` and is the authority for which
language codes are valid — validate against `Object.keys(translations)`, never a
hardcoded list. Arabic sets `dir: 'rtl'`, applied to `<html>` by `LanguageContext`.

Every user-facing string goes in all three. Curriculum text itself comes from the
CSV and stays in English by design.

### PWA and reminders

`public/sw.js` is hand-written: navigations network-first (caching only
`response.ok` — caching a 404 would make it the permanent offline shell — and
only the app root itself), content-hashed assets cache-first, cross-origin
untouched, `share/` left entirely to the network. Bump `CACHE` to invalidate.

`public/share/<id>/` are per-program link-preview pages for crawlers (which
never run JS), generated by `npm run share:cards` — never edit them by hand;
`sharePages.test.js` fails on drift. Milestone posts link to them via
`shareUrl(program)` in `src/lib/appUrl.js`.

Reminders have two tiers. Periodic Background Sync is live (Chromium only). True
Web Push is fully wired but **dormant**: `PUSH_ENDPOINT` in `src/lib/pushConfig.js`
is empty, so `reminders.js` short-circuits and `.github/workflows/remind.yml`
exits as a no-op. `PUSH_ENDPOINT` is a build-time constant — setting the repo
secret alone changes nothing on the client.

Analytics is **active**: `GOATCOUNTER_SITE = 'alxpace'`. Plain GET beacons, no
vendor script, DNT and GPC honoured, aggregate counts only.

- **Keep the first open of a day at 4 hits or fewer.** GoatCounter's published
  `/count` limit is 4/s per IP and browser, and a refused beacon is lost
  silently. The day's first open sends 3: `/`, `open-*`, and the one daily
  event, `week-N-<status>`; `analytics.test.js` holds it at 4 or fewer. (From
  4 to 11 Oct 2026 the app sent 5; the real counts show the hosted service let
  them all through, so that limit isn't enforced as published, but don't rely
  on it.)
- The daily event is sent with `ns=true` (count every hit): the app already
  sends it once a day, and GoatCounter's own 8-hour sessions would merge
  learners behind one address.
- Event names are a contract with the dashboard. `readDay` in
  `src/metrics/model.js` reads every set the app has ever sent (its comment
  lists them); a new name needs a reading there, or its days read as empty.

### The learner dashboard (`/metrics/`)

```
GoatCounter API → scripts/metrics/collect.mjs (metrics.yml, daily 05:23 UTC)
  → metrics.json on the `metrics` branch → metrics/index.html reads it
  Mondays: scripts/metrics/digest.mjs → Slack incoming webhook
```

- Its own Vite build (`vite.metrics.config.js`, run by `npm run build` after the
  app's) into `dist/metrics/`, so it can never change the app's output: never
  add it to `vite.config.js` as a second input, which shares chunks with the
  app. It has its own Tailwind config too (`tailwind.metrics.config.js`; the
  app's config excludes `src/metrics/**`, so the app's CSS stays its own).
- `src/metrics/*.js` also runs in plain Node (the scripts), so it uses explicit
  `.js` import paths and never the app's extensionless modules. That is why
  `config.js` repeats the app's address; a test holds the two equal.
- The service worker leaves `metrics/` to the network: the page and every file
  it loads live under that path.
- The Slack digest posts each week once, on the Monday or the first run after;
  the last week posted is in `digest.json` on the `metrics` branch. The
  numbers are pushed before it posts, so its button links a week already
  published; keep that order.
- Secrets `GOATCOUNTER_API_KEY` (read-only stats key) and `SLACK_WEBHOOK_URL`
  are the owner's to add. Without them each step is a logged no-op, never red.
- What the page shows lives in its address (`src/metrics/dashboard/range.js`):
  `?range=7|30|90|all` or `?from=&to=` days, clamped to the days on record.
  The Slack digest's button links its week that way.
- Visits lead the page and the digest: GoatCounter's own count (every path's
  visits, events included), which is what its dashboard shows. The digest
  leads with the running total since counting began, to the day before it
  posts (the week's Sunday, on a Monday), then the week's own visits; the
  page counts the days picked.
- Every number on the page and in the digest is an exact count, never an
  average: learners on one day, learner-days (one learner on one day) over
  several. Unique learners over several days can't be counted, since nothing
  identifies a learner from one day to the next; don't label learner-days as
  learners. `metrics.test.js` fails on a decimal in the digest.
- Unique learners are shown as a range (`summarize().unique`): at least the
  most counted on any one day, at most the learner-days. Don't call any of it
  exact: the app's once-a-day guard is the learner's local day, GoatCounter's
  day is UTC, so one browser can be counted twice either side of midnight. Don't
  publish a tighter floor worked out from start-date cohorts: learners can
  change their start date (it defaults to today) and reappear in another
  browser, so such a floor can overcount.
- `?data=<url>` points the page at another file, under `npm run dev` only.
  `scripts/metrics/sample.mjs` makes one; README has the commands.

## What makes a feature expensive here

- Anything needing accounts, sync across devices, or cross-learner visibility is
  an architecture change, not a feature — it requires a backend and ends the
  zero-login premise.
- Anything requiring the network at runtime conflicts with offline-first.
- Anything below 375px width or under a 44px tap target breaks the mobile
  baseline the app is built to.
- Any new persisted key needs an explicit decision about the origin handoff.
