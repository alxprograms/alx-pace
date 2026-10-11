/**
 * Reads daily counts per path from GoatCounter's API.
 *
 * GET /api/v0/stats/hits with group=day returns up to 100 paths a page, each
 * with one `stats` entry per day of the range ({ day, daily }), zero days
 * included; `more` says another page follows, fetched by excluding the path
 * ids already returned. Shapes and limits are from GoatCounter's own source
 * (handlers/api.go, hit_list.go): 4 requests a second and 500 an hour per key.
 *
 * A 429, a 5xx or a dropped connection is tried again, up to MAX_RETRIES
 * times, so one bad moment doesn't cost a day's run; a 404 once (see getJSON). `fetchImpl` and `sleep`
 * are injectable so the paging and the retries can be tested without a
 * network.
 */

const PAGE_SIZE = 100
const MAX_PAGES = 20
const MAX_RETRIES = 4
// Stays well under 4 requests a second.
const SPACING_MS = 400

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class GoatCounterError extends Error {}

/**
 * Every path's daily counts from `from` to `to` (YYYY-MM-DD, both included),
 * as the raw `hits` array of all pages.
 */
export async function fetchDailyHits({ site, token, from, to, fetchImpl = fetch, sleep = realSleep }) {
  if (!site || !token) throw new GoatCounterError('fetchDailyHits needs a site and an API token')
  const base = `https://${site}.goatcounter.com/api/v0/stats/hits`
  const hits = []
  const seen = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      start: from,
      end: to,
      group: 'day',
      limit: String(PAGE_SIZE),
    })
    if (seen.length) params.set('exclude_paths', seen.join(','))
    const body = await getJSON(`${base}?${params}`, token, fetchImpl, sleep)
    for (const hit of body.hits ?? []) {
      hits.push(hit)
      if (hit.path_id != null) seen.push(hit.path_id)
    }
    if (!body.more || !(body.hits ?? []).length) return hits
    await sleep(SPACING_MS)
  }
  throw new GoatCounterError(`more than ${MAX_PAGES * PAGE_SIZE} paths; refusing to page further`)
}

async function getJSON(url, token, fetchImpl, sleep) {
  let retried404 = false
  for (let attempt = 0; ; attempt++) {
    let res
    try {
      res = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
    } catch (error) {
      // A dropped connection: worth another try, like a 5xx. The URL in the
      // message holds no secret; the token travels in a header.
      if (attempt < MAX_RETRIES) {
        await sleep(2000 * 2 ** attempt)
        continue
      }
      throw new GoatCounterError(`GoatCounter unreachable: ${error?.message ?? error}`)
    }
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      // X-Rate-Limit-Reset (on a 429): seconds until the window frees up.
      const reset = res.status === 429 ? Number(res.headers?.get?.('X-Rate-Limit-Reset')) : NaN
      await sleep(Number.isFinite(reset) && reset > 0 ? reset * 1000 : 2000 * 2 ** attempt)
      continue
    }
    if (res.status === 404 && !retried404) {
      /*
        GoatCounter answers 404 "not found" to a key's first request in 24
        hours, whatever is asked. Noting the key's last use loses which user
        it belongs to (handlers/api.go: token.Touch, then user.ByID with user
        id 0), and the next request, which skips that step, works. A daily
        job is that first request nearly every day, so it asks once more.
      */
      retried404 = true
      await sleep(SPACING_MS)
      continue
    }
    if (!res.ok) {
      // The body names the problem ("invalid API key", "no permission"); the
      // token is never part of the message.
      const text = await res.text().catch(() => '')
      const hint = res.status === 404 ? ' (is GOATCOUNTER_SITE the site this key belongs to?)' : ''
      throw new GoatCounterError(`GoatCounter ${res.status}: ${text.slice(0, 300)}${hint}`)
    }
    return res.json()
  }
}
