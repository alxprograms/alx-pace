import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, it, expect, vi } from 'vitest'

import { APP_URL, shareUrl } from './appUrl'
import { PROGRAM_IDS } from './programs'
import { SCHEDULES } from './schedule'
import {
  APP_URL as GENERATOR_APP_URL,
  IMAGE_HEIGHT,
  IMAGE_WIDTH,
  shareCard,
  sharePageHtml,
} from '../../scripts/share-cards.mjs'

/*
  The per-program link-preview pages.

  Crawlers (LinkedIn, WhatsApp, X, Slack) read these tags from static HTML and
  never run JavaScript, so nothing else in the suite can see whether a learner's
  post previews as their program. These assert the committed pages say what the
  generator says, carry every tag a crawler needs with absolute URLs, and send a
  person on to the app.
*/

const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url))
const read = (path) => readFileSync(`${PUBLIC}${path}`, 'utf8')

/** content="" of <meta property|name="key">, or null. */
function meta(html, key) {
  const re = new RegExp(`<meta\\s+(?:property|name)="${key.replace(/[:]/g, '\\$&')}"\\s+content="([^"]*)"`)
  const m = re.exec(html)
  return m ? m[1] : null
}

/** Width and height straight from a PNG's IHDR chunk. */
function pngSize(path) {
  const buf = readFileSync(path)
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

describe.each(PROGRAM_IDS)('share/%s/', (id) => {
  const html = read(`share/${id}/index.html`)

  it('is exactly what scripts/share-cards.mjs generates — re-run it after editing', () => {
    expect(html).toBe(sharePageHtml(shareCard(id)))
  })

  it('carries every tag a crawler needs', () => {
    for (const key of [
      'og:type',
      'og:site_name',
      'og:url',
      'og:title',
      'og:description',
      'og:image',
      'og:image:width',
      'og:image:height',
      'og:image:alt',
      'twitter:card',
      'twitter:title',
      'twitter:description',
      'twitter:image',
    ]) {
      expect(meta(html, key), key).toBeTruthy()
    }
    expect(meta(html, 'twitter:card')).toBe('summary_large_image')
  })

  it('names its own program and length, and no other program', () => {
    const name = shareCard(id).name
    const others = PROGRAM_IDS.filter((o) => o !== id).map((o) => shareCard(o).name)
    for (const key of ['og:title', 'og:description', 'og:image:alt']) {
      expect(meta(html, key)).toContain(name)
      for (const other of others) expect(meta(html, key)).not.toContain(other)
    }
    expect(meta(html, 'og:description')).toContain(`${SCHEDULES[id].totalWeeks}-week`)
  })

  it('uses absolute https URLs, pointing at itself and its own image', () => {
    expect(meta(html, 'og:url')).toBe(shareUrl(id))
    expect(meta(html, 'og:image')).toBe(`${shareUrl(id)}og-image.png`)
    expect(meta(html, 'twitter:image')).toBe(meta(html, 'og:image'))
    expect(meta(html, 'og:image')).toMatch(/^https:\/\//)
  })

  it('ships a 1200×627 image under 1 MB at that address', () => {
    const file = `${PUBLIC}share/${id}/og-image.png`
    expect(existsSync(file)).toBe(true)
    expect(pngSize(file)).toEqual({ width: IMAGE_WIDTH, height: IMAGE_HEIGHT })
    expect(meta(html, 'og:image:width')).toBe(String(IMAGE_WIDTH))
    expect(meta(html, 'og:image:height')).toBe(String(IMAGE_HEIGHT))
    expect(statSync(file).size).toBeLessThan(1024 * 1024)
  })

  it('sends a person to the app root three ways, all relative to the base path', () => {
    expect(html).toContain(`location.replace('../../')`)
    expect(html).toMatch(/<meta http-equiv="refresh" content="\d+; url=\.\.\/\.\.\/" \/>/)
    expect(html).toContain('<a href="../../">')
  })
})

describe('the share URL a milestone post carries', () => {
  it('points at the learner’s program page', () => {
    for (const id of PROGRAM_IDS) expect(shareUrl(id)).toBe(`${APP_URL}share/${id}/`)
  })

  it('falls back to the app root for anything else', () => {
    for (const bad of [undefined, null, '', 'xx', '__proto__']) expect(shareUrl(bad)).toBe(APP_URL)
  })

  it('agrees with the generator on where the app lives', () => {
    expect(GENERATOR_APP_URL).toBe(APP_URL)
  })
})

describe('the app root card', () => {
  const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8')

  it('is program-neutral now that the root serves every program', () => {
    for (const key of ['og:description', 'twitter:description', 'og:image:alt']) {
      for (const id of PROGRAM_IDS) expect(meta(html, key), key).toContain(shareCard(id).name)
    }
    expect(html).not.toMatch(/14-week Data Analytics/)
  })

  it('declares the size its image really is', () => {
    expect(pngSize(`${PUBLIC}og-image.png`)).toEqual({ width: IMAGE_WIDTH, height: IMAGE_HEIGHT })
    expect(meta(html, 'og:image:height')).toBe(String(IMAGE_HEIGHT))
  })
})

/*
  The service worker caches navigations as the offline app shell. A share page
  is navigable too, and cached as the shell it would leave an installed app that
  opens offline on a page whose only job is to redirect. Run the real sw.js
  against fakes and check what it does with each kind of navigation.
*/
describe('the service worker and share pages', () => {
  const source = readFileSync(`${PUBLIC}sw.js`, 'utf8')

  function boot(scope = 'https://example.org/alx-pace/') {
    const handlers = {}
    const put = vi.fn()
    const self = {
      location: new URL(`${scope}sw.js`),
      addEventListener: (type, fn) => {
        handlers[type] = fn
      },
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() },
      registration: { showNotification: () => Promise.resolve() },
    }
    const caches = {
      open: () => Promise.resolve({ put, addAll: () => Promise.resolve() }),
      match: () => Promise.resolve(undefined),
      keys: () => Promise.resolve([]),
    }
    const page = { ok: true, clone() { return this } }
    const fetch = vi.fn(() => Promise.resolve(page))
    new Function('self', 'caches', 'fetch', source)(self, caches, fetch)

    async function navigate(path) {
      let responded = null
      handlers.fetch({
        request: { method: 'GET', mode: 'navigate', url: new URL(path, scope).href },
        respondWith: (p) => {
          responded = p
        },
      })
      if (responded) await responded
      await new Promise((r) => setTimeout(r, 0))
      return { intercepted: Boolean(responded) }
    }

    async function load(path, from) {
      let responded = null
      handlers.fetch({
        request: { method: 'GET', mode: 'cors', url: new URL(path, scope).href, referrer: new URL(from, scope).href },
        respondWith: (p) => {
          responded = p
        },
      })
      if (responded) await responded
      await new Promise((r) => setTimeout(r, 0))
      return { intercepted: Boolean(responded) }
    }
    return { navigate, load, put, fetch, handlers }
  }

  it('leaves share pages entirely to the network', async () => {
    const sw = boot()
    for (const id of PROGRAM_IDS) {
      expect((await sw.navigate(`share/${id}/`)).intercepted).toBe(false)
    }
    expect(sw.put).not.toHaveBeenCalled()
  })

  it('still caches the app itself as the offline shell', async () => {
    const sw = boot()
    expect((await sw.navigate('./')).intercepted).toBe(true)
    expect(sw.put).toHaveBeenCalledWith('./', expect.anything())
  })

  it('never caches some other page as the shell', async () => {
    const sw = boot()
    await sw.navigate('somewhere-else.html')
    expect(sw.put).not.toHaveBeenCalled()
  })

  it('leaves the metrics dashboard, and what it loads, to the network', async () => {
    const sw = boot()
    expect((await sw.navigate('metrics/')).intercepted).toBe(false)
    expect((await sw.load('metrics/assets/index-abc123.js', 'metrics/')).intercepted).toBe(false)
    expect(sw.put).not.toHaveBeenCalled()
    // The app's own assets are still cached as before.
    expect((await sw.load('assets/index-abc123.js', './')).intercepted).toBe(true)
  })

  it('still serves the app from the dashboard’s link to it, offline included', async () => {
    const sw = boot()
    let responded = null
    sw.handlers.fetch({
      request: { method: 'GET', mode: 'navigate', url: 'https://example.org/alx-pace/', referrer: 'https://example.org/alx-pace/metrics/' },
      respondWith: (p) => {
        responded = p
      },
    })
    expect(responded).not.toBeNull()
  })

  it('works under a root scope too (local preview)', async () => {
    const sw = boot('https://localhost:4173/')
    expect((await sw.navigate('share/cc/')).intercepted).toBe(false)
    await sw.navigate('./')
    expect(sw.put).toHaveBeenCalledTimes(1)
  })
})
