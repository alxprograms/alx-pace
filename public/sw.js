/**
 * Minimal, deterministic service worker for ALX Pace.
 *
 * Strategy:
 *  - App shell ('./'): network-first, cached copy as offline fallback — new
 *    deploys are picked up on the next online visit.
 *  - Same-origin static assets (Vite emits content-hashed filenames, so they
 *    are immutable): cache-first. That includes the bundled Poppins files,
 *    so the app keeps its typeface offline.
 *  - Cross-origin requests: untouched.
 *
 * Also handles reminders:
 *  - 'periodicsync': shows the last status message the app mirrored into
 *    IndexedDB (localStorage is not reachable from a SW).
 *  - 'push': shows a Web Push payload (used once PUSH_ENDPOINT is configured).
 *  - 'notificationclick': focuses or reopens the app.
 *
 * Bump CACHE version to invalidate everything after a breaking change.
 */
const CACHE = 'alx-pace-v3'

// Paths resolved against this worker's own location, so they are right under
// /alx-pace/ on Pages and under / in local preview.
const ROOT_PATH = new URL('./', self.location).pathname
const SHELL_PATHS = new Set([ROOT_PATH, `${ROOT_PATH}index.html`])
const SHARE_PATH = `${ROOT_PATH}share/`
const METRICS_PATH = `${ROOT_PATH}metrics/`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  /*
    The per-program share pages (share/<id>/) are not the app. They exist for
    link crawlers and bounce a person straight on to the root. Left to the
    navigation branch below, the redirect page would be cached as './' — the
    one entry the app falls back to offline — and an installed app opened
    offline would show a page that only redirects. So the SW stays out of
    their way entirely.
  */
  if (url.pathname.startsWith(SHARE_PATH)) return

  /*
    Nor is the learner-usage dashboard (metrics/), a separate page that only
    the people running the app read. Offline, the fallback below would show
    the app at its address; and its scripts, cached here, would only fill a
    learner's phone. So the SW leaves it, and anything it loads, to the
    network.
  */
  if (url.pathname.startsWith(METRICS_PATH)) return
  if (request.referrer && new URL(request.referrer).pathname.startsWith(METRICS_PATH)) return

  // Navigations: network-first with offline fallback to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          /*
            Only a real page is worth keeping. Caching unconditionally turns a
            404 or a 502 into the offline shell — and since './' is the single
            entry the app ever falls back to, the learner would then be served
            that error page every time they open offline, with no way to
            recover but clearing site data. It bites hardest during a move,
            when the old address is precisely what starts returning 404.
          */
          // And only the app itself is the shell — never some other page
          // that happens to be navigable under this scope.
          if (response.ok && SHELL_PATHS.has(url.pathname)) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put('./', copy))
          }
          return response
        })
        .catch(() => caches.match('./')),
    )
    return
  }

  // Static assets: cache-first (content-hashed, immutable).
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})

/* ---------- Reminders ---------- */

function readReminderState() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('alx-pace', 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore('reminder')
      }
      req.onerror = () => resolve(null)
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction('reminder', 'readonly')
          const get = tx.objectStore('reminder').get('state')
          get.onsuccess = () => {
            resolve(get.result || null)
            req.result.close()
          }
          get.onerror = () => {
            resolve(null)
            req.result.close()
          }
        } catch {
          resolve(null)
        }
      }
    } catch {
      resolve(null)
    }
  })
}

const NOTIFICATION_BASE = {
  icon: './icons/icon-192.png',
  badge: './icons/icon-192.png',
  data: { url: './' },
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'alx-pace-reminder') return
  event.waitUntil(
    (async () => {
      const state = await readReminderState()
      const title = (state && state.title) || 'ALX Pace'
      const body =
        ((state && state.body) || 'Your weekly self-pace check-in is ready.') +
        ' Tap to open your tracker.'
      await self.registration.showNotification(title, {
        ...NOTIFICATION_BASE,
        body,
        tag: 'alx-pace-weekly',
      })
    })(),
  )
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    /* non-JSON payload — use defaults */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'ALX Pace', {
      ...NOTIFICATION_BASE,
      body: payload.body || 'New week — open your tracker to see what’s due.',
      tag: 'alx-pace-push',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ('focus' in client) return client.focus()
        }
        return self.clients.openWindow('./')
      }),
  )
})
