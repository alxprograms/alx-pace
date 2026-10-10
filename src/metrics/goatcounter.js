/**
 * Reads daily counts per path from GoatCounter's API.
 *
 * GET /api/v0/stats/hits with group=day returns up to 100 paths a page, each
 * with one `stats` entry per day of the range ({ day, daily }), zero days
 * included; `more` says another page follows, fetched by excluding the path
 * ids already returned. Shapes and limits are from GoatCounter's own source
 * (handlers/api.go, hit_list.go): 4 requests a second and 500 an hour per key.
 *
 * `fetchImpl` and `sleep` are injectable so the paging and the retry on 429
 * can be tested without a network.
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
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    if (res.status === 429 && attempt < MAX_RETRIES) {
      // X-Rate-Limit-Reset: seconds until the window frees up.
      const reset = Number(res.headers?.get?.('X-Rate-Limit-Reset'))
      await sleep(Number.isFinite(reset) && reset > 0 ? reset * 1000 : 2000 * 2 ** attempt)
      continue
    }
    if (!res.ok) {
      // The body names the problem ("invalid API key", "no permission"); the
      // token is never part of the message.
      const text = await res.text().catch(() => '')
      throw new GoatCounterError(`GoatCounter ${res.status}: ${text.slice(0, 300)}`)
    }
    return res.json()
  }
}
